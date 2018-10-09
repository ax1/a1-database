module.exports = { connect, disconnect }

const fs = require('fs')
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
    let realPath = path.join(process.cwd(), filePath)
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
    this._rows = []
    this._map = new Map()
    this._filePath = filePath
    this._file = null
    this._counter = 0
    this._inited = false
  }

  async _destroy() {
    await this._compactDB()
    await fsclose(this._file)
  }

  async load() {
    this._inited = true
    await this._compactDB()
  }

  async find(filter) {
    if (this._mustCompact()) await this._compactDB()
    return this._clone(this._rows.filter(filter))
  }

  /**
   * filter is optional
   * @param {Array|Object} arr
   * @param {*} filter Elements to be deleted
   */
  async save(arr, filter) {
    arr = this._clone(arr)
    this._counter = this._counter + 1
    if (this._mustCompact()) await this._compactDB()
    let countDeleted = 0
    if (filter) countDeleted = await this.delete(filter)
    if (!arr.forEach) arr = [arr] //arr was object
    arr.forEach(el => this._rows.push(el))
    await Promise.all(arr.map(el => this._persist('save', el)))
    return arr.length - countDeleted
  }

  async delete(filter) {
    this._counter = this._counter + 1
    if (this._mustCompact()) await this._compactDB()
    const arr = this._rows.filter(filter)
    const self = this
    arr.forEach(el => { const index = self._rows.indexOf(el); return self._rows.splice(index, 1) })
    await Promise.all(arr.map(el => self._persist('delete', el)))
    return arr.length
  }

  async _persist(action, json) {
    fswrite(this._file, this._toText(action, json))
  }

  _toText(action, json) {
    return action + '|' + JSON.stringify(json) + '\n'
  }

  async _compactDB() {
    // check file
    if (this._file) fsclose(this._file)
    let content = ''
    try {
      content = await fsreadFile(this._filePath, 'utf-8')
    } catch (err) {
      if (err.code === 'ENOENT') {
        try { await fsmkdir(path.dirname(this._filePath)) } catch (e) { console.log('folder already exists') }
        await fswriteFile(this._filePath, content)
      } else throw (err)
    }
    // remove all duplicated string
    const set = new Set(content.split('\n'))
    set.delete('')
    // process each lines
    const lines = [...set]
    const tempSet = new Set()
    lines.map(el => el.split('|'))
      .forEach(([action, text]) => {
        if (action === 'save') tempSet.add(text)
        else tempSet.delete(text)
      })
    // TODO backup file before this
    const elements = [...tempSet].map(el => JSON.parse(el)) //check all jsons are valid before rewriting
    this._counter = 0
    await fswriteFile(this._filePath, '')
    this._file = await fsopen(this._filePath, 'a+')
    await this.save(elements)
  }

  _mustCompact() {
    //TODO enable compacting in the middle of running is useful but compact() must be changed to use only 1 file open an locked to prevent corruption (i.e: two async save calls from different points of a program)
    if (!this._inited) {
      this._inited = true
      return true
    } else return false
    //return (this.counter === 0 || this._counter > 10000) ? true : false
  }

  _clone(el) {
    return JSON.parse(JSON.stringify(el))
  }
}
// async function test() {
//   const file = await fsopen('../test/test.db', 'a+')
//   const content = await fsreadFile(file)
//   console.log(content.toString())
//   await fswrite(file, '\nkkkkkkkkeeeeee')
// }
//
// test()