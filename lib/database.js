module.exports = { connect, disconnect }

const fs = require('fs')
const fsp = require('fs').promises
const path = require('path')
const util = require('util')

const dbs = []
const fsopen = util.promisify(fs.open)
const fsclose = util.promisify(fs.close)
const fswrite = util.promisify(fs.write)
const fsreadFile = util.promisify(fs.readFile)
const fswriteFile = util.promisify(fs.writeFile)
const fsmkdir = util.promisify(fs.mkdir)

async function connect(filePath) {
  let db = dbs[filePath]
  if (!db) {
    let realPath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)
    db = new Db(realPath)
    await db.load()
  } else {
    if (db.isOpen) throw new Error('database ' + filePath + ' is already open')
  }
  return db
}

async function disconnect(db) {
  const pos = dbs.indexOf(db)
  dbs.splice(pos, 1)
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
    await fsclose(this._file)
  }

  async load() {
    await this._loadFile()
    await this._compactDB()
  }

  async find(filter) {
    return this._clone(this._rows.filter(filter))
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
    arr = this._clone(arr) // clone because arr could change when this async function is waiting for persist event
    if (!Array.isArray(arr)) arr = [arr]
    this._counter++
    if (this._mustCompact()) await this._compactDB()
    let countDeleted = 0
    if (filter) countDeleted = await this.delete(filter)
    arr.forEach(el => this._rows.push(el))
    for (let el of arr) await this._persist('save', el)
    return arr.length - countDeleted
  }

  async delete(filter) {
    this._counter++
    if (this._mustCompact()) await this._compactDB()
    const arr = this._rows.filter(filter)
    const self = this
    arr.forEach(el => { const index = self._rows.indexOf(el); return self._rows.splice(index, 1) })
    for (let el of arr) await this._persist('delete', el)
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
    while (this._lock) { await sleep(100) }
    await fswrite(this._file, this._toText(action, json))
  }

  async _loadFile() {
    if (this._file) await fsclose(this._file)
    let content = ''

    //access file
    try {
      content = await fsreadFile(this._filePath, 'utf-8')
    } catch (err) {
      if (err.code === 'ENOENT') {
        try { await fsmkdir(path.dirname(this._filePath)) } catch (e) { console.log('folder already exists') }
        await fswriteFile(this._filePath, content)
      } else throw (err)
    }

    //load content into memory
    const DEL = 'delete|'
    const arr = content.split('\n').filter(el => el != '')
    const set = new Set() //first into a set to remove duplicated
    arr.forEach(el => el.startsWith(DEL) ? set.delete(el.substring(DEL.length)) : set.add(el))
    set.delete('')
    set.forEach(el => {
      const obj = el.startsWith('[') | el.startsWith('{') ? JSON.parse(el) : el
      this._rows.push(obj)
    })

    // set the file as open
    this._file = await fsopen(this._filePath, 'a+')
  }

  /**
   * Format row. Note: to allow also parsing raw JSON lines (historical data files,logs,etc), the 'save' action is removed
   */
  _toText(action, json) {
    const prefix = action === 'delete' ? action + '|' : ''
    return prefix + JSON.stringify(json) + '\n'
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
    await fsp.writeFile(this._filePath + '.bak.db', content)

    // replace the database with clean content
    try {
      this._lock = true
      if (this._file) await fsclose(this._file)
      await fsp.writeFile(this._filePath, content)
      this._file = await fsopen(this._filePath, 'a+')
      this._counter = 0
      // everythingok, remove bak file
      fsp.unlink(this._filePath + '.bak.db')
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
