const Bluebird = require('bluebird')
const Nedb = require('nedb')
let database

module.exports = { start, getDB }

async function start(path) {
  if (!database) {
    let db = new Nedb({ filename: path, autoload: true })
    database = Bluebird.promisifyAll(db)
  }
  return database
}


function getDB() {
  if (!database) throw 'database is not inited yet'
  else return database
}
