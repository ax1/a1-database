module.exports = { connect, disconnect, get }

const fs = require('fs/promises')
const path = require('path')

const dbs = {}

/**
 * Connect to a database
 * @param {String} filePath absolute or relative path to db. If not exists, create file 
 * @returns {Db}
 */
async function connect(filePath) {
  let db = dbs[filePath]
  if (!db) {
    let realPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
    db = new Db(realPath)
    await db.load()
  } else {
    if (db.isOpen) throw new Error('database ' + filePath + ' is already open')
  }
  dbs[filePath] = db
  return db
}

/**
 * Same as connect, with better name to state that the database is not created if already exists.
 * This function is useful to reuse db references.  
 * @param {string} filePath 
 * @returns {Db} the db object
 */
async function get(filePath) {
  return await connect(filePath)
}

async function disconnect(db) {
  delete dbs[db._filePath]
  await db._destroy()
  db = null
}

class Db {

  constructor(filePath) {
    this._rows = [] // the array[objects] representing the database in the RAM
    this._map = new Map()
    this._filePath = filePath
    this._file = null
    this._counter = 0
    this._lock = false
  }

  async _destroy() {
    await this._compactDB()
    await this._file.close()
  }

  async load() {
    await this._loadFile()
    await this._compactDB()
  }


  /**
   * Find elements in database.
   * 
   * This method performs either find(id) or find(text) or find(filter)
   * 
   * @param {number|String|Function} id_or_filter const - if number or String it finds by  the 'id' in database
   * @returns Array[Object]
   */
  async find(id_or_filter) {
    let filter
    if (typeof id_or_filter === 'function') filter = id_or_filter
    else filter = el => el.id === id_or_filter || el === id_or_filter
    return this._clone(this._rows.filter(filter))
  }

  /**
   * Find ONE element in database. If many elements, only the first one is returned.
   * 
   * This method performs either findOne(id) or findOne(text) or findOne(filter)
   * 
   * @param {number|String|Function} id_or_filter const - if number or String it finds by  the 'id' in database
   * @returns {Object | null }
   */
  async findOne(id_or_filter) {
    const arr = await this.find(id_or_filter)
    return arr.length > 0 ? arr[0] : null
  }

  /**
   * Check if an element exists.
   *  
   * @param {number|string|Function} id_or_filter 
   * @returns {boolean}
   */
  async exists(id_or_filter) {
    const items = await this.find(id_or_filter)
    return items.length > 0
  }

  /**
   * Insert an item o array of items. 
   * If items have `id` property, and the id is already in database,
   * this method will throw an error.
   * Use `save()` method if you want to use insert/update (upsert)
   * @param {Array|Object} arr the object or the array of objects to be stored 
   * @returns {number} the net number of items added
   */
  async insert(arr) {
    if (!Array.isArray(arr)) arr = [arr]
    arr.forEach(el => { if (el.id != null && this._rows.find(row => el.id === row.id)) throw Error('Duplicated id: ' + el.id) })
    return await this._save(arr)
  }

  /**
   * Insert an item. if item has id, and existing in database, the item is updated
   * @param {Array|Object} arr the object or the array of objects to be stored 
   * @returns {number} the net number of items added
   */
  async upsert(arr) {
    if (!Array.isArray(arr)) arr = [arr]
    const ids = arr.filter(el => el.id != null).map(el => el.id)
    const filter = el => ids.includes(el.id)
    return await this._save(arr, filter)
  }

  /**
 * Update an item. if item has id, and does not exists in database, an error is thrown
 * @param {Array|Object} arr the object or the array of objects to be stored 
 * @returns {number} the net number of items added
 */
  async update(arr) {
    if (!Array.isArray(arr)) arr = [arr]
    const ids = arr.filter(el => el.id != null).map(el => el.id)
    ids.forEach(id => { if (this._rows.find(row => id === row.id) === undefined) throw Error('id: ' + id + 'is not in database. Use insert, or upsert instead.') })
    const filter = el => ids.includes(el.id)
    return await this._save(arr, filter)
  }
  /**
   * Save an item or an array of items into the database. Filter is optional .This is similar to a SQL UPSERT operation
   * @param {Array|Object} arr the object or the array of objects to be stored
   * @param {Function} filter? Elements to be deleted
   * @returns {number} the net number of items added - items deleted 
   */
  async save(arr, filter) {
    // if own filter, use it
    return filter ? await this._save(arr, filter) : await this.upsert(arr, filter)
  }

  /**
   * Internal save function. No inferred filter is created.
   * @param {*} arr 
   * @param {*} filter 
   */
  async _save(arr, filter) {
    this._counter++
    arr = this._clone(arr) // clone because arr could change when this async function is waiting for persist event
    if (!Array.isArray(arr)) arr = [arr]
    if (this._mustCompact()) await this._compactDB()

    //excute sync operations (next entries to this method will have the latest _rows)
    let countDeleted = 0
    let oldRows = []
    if (filter) {
      oldRows = this._rows.filter(filter)
      countDeleted = oldRows.length
      oldRows.forEach(el => { const index = this._rows.indexOf(el); this._rows.splice(index, 1) })
    }
    arr.forEach(el => this._rows.push(el))

    //execute async operations
    const p1 = oldRows.map(el => this._persist('delete', el))
    const p2 = arr.map(el => this._persist('save', el))
    await Promise.all([...p1, ...p2])
    return arr.length - countDeleted
  }

  /**
 * Delete elements in database.
 * 
 * This method performs either delete(id) or delete(text) or delete(filter)
 * 
 * @param {number|string|Function} id_or_filter - If number or String it finds by  the 'id' in database,
 * @returns {number} - The number of deleted items
 */
  async delete(id_or_filter) {
    this._counter++
    if (this._mustCompact()) await this._compactDB()

    let filter
    if (typeof id_or_filter === 'function') filter = id_or_filter
    else filter = el => el.id === id_or_filter || el === id_or_filter

    const arr = this._rows.filter(filter)
    arr.forEach(el => { const index = this._rows.indexOf(el); if (index >= 0) this._rows.splice(index, 1) })
    await Promise.all([arr.map(el => this._persist('delete', el))])
    return arr.length
  }

  async _persist(action, json) {
    //stop the world while the database is still writing or compacting, but set a timeout to warn when the persist time is too long

    /* DISABLE TO SEE if corruption problems are in this phase (ie: two persist at the same time or similar)
    let t1 = null //note: do not init time here to speedup the function
    while (this._lock) {
      if (!t1) t1 = Date.now()
      await sleep(100)
      if (Date.now() - t1 > 10000) throw Error('a1-database: CRITICAL developer error or the file database is too big. The db was locked (compacting) for more than 10 seconds while a persist operation was requested')
    }*/
    while (this._lock) { await sleep(1000) }
    await this._file.write(this._toText(action, json))
  }

  async _loadFile() {
    if (this._file) await this._file.close()
    let content = ''

    //access file
    try {
      content = await fs.readFile(this._filePath, 'utf-8')
    } catch (err) {
      if (err.code === 'ENOENT') {
        await fs.mkdir(path.dirname(this._filePath), { recursive: true })
        await fs.writeFile(this._filePath, content)
      } else throw (err)
    }

    //load content into memory
    const DEL = 'delete|'
    const arr = content.split('\n').filter(el => el != '')
    const set = new Set() //first into a set to remove duplicated
    arr.forEach(el => el.startsWith(DEL) ? set.delete(el.substring(DEL.length)) : set.add(el))
    set.delete('')
    set.forEach(el => {
      const isArray = el.startsWith('[') && el.endsWith(']')
      const isObject = el.startsWith('{') && el.endsWith('}')
      const obj = (isArray || isObject) ? JSON.parse(el) : el
      this._rows.push(obj)
    })

    // set the file as open
    this._file = await fs.open(this._filePath, 'a+')
  }

  /**
   * Format row. Note: to allow also parsing raw JSON lines (historical data files,logs,etc), the 'save' action is removed
   */
  _toText(action, json) {
    const prefix = action === 'delete' ? action + '|' : ''
    const text = json.charAt ? json : JSON.stringify(json)
    return prefix + text + '\n'
  }

  /**
   * Compact the database.
   */
  async _compactDB() {

    //clean rows (remove duplicated) in the in_memory database (RAM)
    let elements = this._rows.map(el => el.charAt ? el : JSON.stringify(el))
    const set = new Set(elements)
    elements = [...set]
    const content = elements.reduce((acc, el) => acc + el + '\n', '')

    // create a backup file before compacting
    await fs.writeFile(this._filePath + '.bak.db', content)

    // replace the database with clean content
    try {
      this._lock = true
      if (this._file) await this._file.close()
      await fs.writeFile(this._filePath, content)
      this._file = await fs.open(this._filePath, 'a+')
      this._counter = 0
      // everythingok, remove bak file
      fs.unlink(this._filePath + '.bak.db')
    } finally {
      this._lock = false
    }
  }

  _mustCompact() {
    if (this._lock) return false
    return (this.counter === 0 || this._counter > 10000) ? true : false
  }

  _clone(el) {
    return JSON.parse(JSON.stringify(el))
  }
}

async function sleep(millis) {
  return new Promise(resolve => setTimeout(resolve, millis))
}
