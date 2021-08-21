# a1-database

Zero installation, zero dependencies, multi-key, persistent, JSON database.


## Installation

```bash
npm install a1-database
```

No external database installation is required because all data is stored in one single file. Perfect for development!.

## Usage

The database uses javascript objects (no ORM is needed). The query results are provided as array of objects.

Portable. Each database is one file. Easy to backup and to dump data.

> Tips: if you use `id` as primary key for items, database operations will be simpler. In most of the cases `save`, `find` and `delete` are the only methods you need.

### Use as SQL database

If items (rows) contain `id`, the database will take care of duplicated keys (you can use `insert`, `upsert`, `update` to feel like SQL ,or use generic `save` as well since it does not require adding filter to remove old items).

### Use as Document database

Multiple keys are allowed by using the appropriate filter function (useful for logs or for data series). In this case use the `save` method with a filter instead of insert,update. This way you can add heterogeneous items, and with filter functions, even primary keys different than `id` (for example, name, id_card, timestamp, etc) are allowed.
To use unique IDs different than `id`, a filter function (e.g: `el = > el.name === $name`) must be provided when saving an element. This will delete the old values and save the new ones.


```javascript
const database = require('a1-database')

async function test() {
  const db = await database.get('users.db') // slightly better than database.connect
  await db.save({ name: 'Juan' })
  await db.save([{ id: 100, value:'old test' }])
  await db.save([{ id: 100, value:'new test' }]) // item with id, so old items are removed
  const results = await db.find(el => el.name === 'Juan')
  const deleteAll= await db.delete(el=>true)
}

test().catch(console.error)
```

## API

> Important: database path is either absolute '/home/myApp/dbs/users.db' or relative to CWD 'dbs/users. Note that it is not relative to the js file (as require('./js') does. This is because if refactoring code occurs, the database paths remains the same. 

### database:
- **async connect(path: string) : Db** -> given a relative path to process.CWD() starts the database connection.
- **async disconnect(db: Db): void** -> close database and clean resources.
- **async get(path: string) : Db** ->  * Same as connect. Better name to state that the database is not created if already exists. This function is useful to reuse db references.

### Db:

- **async save(item(s):Array|Object [,filter: Function]) : number** -> save items, optionally delete old items by using a function, return the number of added. This is a general purpose save method, covering a wide range of situations by using different filters). If no filter, and items have 'id', the old items are deleted automatically. If items have primary key different than id, you must set the filter function to delete them.  

- **async find(id_or_filter: number|String|Function): Array<Object\>** -> Find elements. This method performs either find(id) or find(filter). If the database is just a list of text, find(id) can be used.

- **async delete(id_or_filter: number|String|Function) : number** -> return number of deleted items based on same id or filter function. 

Secondary methods (reduce repetitive code, trust me):
- **async findOne(id_or_filter: number|String|Function): Object** -> Find ONE element. This method performs either findONE(id) or findOne(filter). Useful when database is a list of unique elements (users, sessions, etc.).

- **async exists(id_or_filter: number|String|Function) : number** -> return true/false if the element is in the database. This is a one-line method instead of the typical finding + checking length array. 

SQL-like methods:

- **async insert(item(s):Array|Object) : number** -> insert new items. If items have 'id' and this id is already in database, an error is thrown. This is the equivalent of SQL INSERT.
- **async upsert(item(s):Array|Object) : number** -> insert or update new items. If items have 'id' and this id is already in database, the item is replaced. Otherwise the items are added. This is the equivalent of SQL UPSERT (or insert on conflict).
- **async update(item(s):Array|Object) : number** -> update existing items. If items have 'id' and this id is not in database, an error is thrown. Otherwise the items are added. This is the equivalent of SQL UPDATE.

### Why filters instead of SELECT/JSON for querying?

Other databases use SQL or JSON models to perform queries. When queries are simple, traditional queries are cleaner (`{age:28}` vs `el => el.age === 28`), but when queries are complex, you need to learn the query syntax "tricky parts", or perform several steps. By using functions (filters) instead, you can create the query the same way you would do when looking up in javascript arrays. Besides, the query is already sanitied.

## Database file format

> The format is compatible for reading plain String or JSON log files

Format of row:

`[action][|]json`

Example:

Plain JSON file as input for reading only

```
{"id":"1","name","Gordon"}
{"id":"2","name","Ramsay"}
```

General database with some insert, update, delete operations. Note: to allow force shutdown of the database, the file can contain `delete` actions. Once the database is loaded again, a `compact` process remove the delete rows keeping the database clean.

```
{"id":"1","name","Gordon"}
{"id":"2","name","Ramsay"}
delete|{"id":"1","name","Gordon"}
delete|{"id":"2","name","Ramsay"}
{"id":"1","name","Gordon Ramsay"}
```

## Backup, restore and compact

- backup: copy the database file.
- restore: drop the file. 
- compact: no need to manual call of compact(). This operation is called automatically when starting and on every 10K consecutive save/delete operations
