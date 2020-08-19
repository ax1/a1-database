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

### Use as SQL database

If items (rows) contain `id`, the database will take care of duplicated keys (use `insert`, `upsert`, `update` methods because they are simpler to work with).

### Use as Document database

Multiple keys are allowed by using the appropriate filter function (useful for logs or for data series). In this case use the `save` method with a filter instead of insert,update. This way you can add heterogeneous items, and with filter functions, even primary keys different than `id` (for example, name, id_card, timestamp, etc) are allowed.
To use unique IDs different than `id`, a filter function (e.g: `el=>el.namt===$nom`) must be provided when saving an element. This will delete the old values and save the new ones.


```javascript
const database = require('a1-database')

async function test() {
  const db = await database.connect('users.db')
  const results = await db.find(el => el.name === 'Juan')
  const deleteAll= await db.delete(el=>true)
}

test().catch(console.error)
```

## API

**database:**
- **async connect(path: string) : Db** -> given a relative path to process.CWD() starts the database connection
- **async disconnect(db: Db): void** -> close database and clean resources

**Db:**
- **async insert(item(s):Array|Object) : number** -> insert new items. If items have 'id' and this id is already in database, an error is thrown. This is the equivalent of SQL INSERT.
- **async upsert(item(s):Array|Object) : number** -> insert or update new items. If items have 'id' and this id is already in database, the item is replaced. Otherwise the items are added. This is the equivalent of SQL UPSERT (or insert on conflict).
- **async update(item(s):Array|Object) : number** -> update existing items. If items have 'id' and this id is not in database, an error is thrown. Otherwise the items are added. This is the equivalent of SQL UPDATE.
- **async delete(filter: function) : number** -> return number of deleted items based on a function.

- **async save(item(s):Array|Object [,filter: function]) : number** -> save items, optionally delete old items by using a function, return the number of added. This is a general purpose save method, covering a wide range of situations by using different filters). If no filter, and items have 'id', the old items are deleted automatically. If items have primary key different than id, you must set the filter function to delete them.  

- **async find(filter: function): Array<Object>** -> return list of items based on a function. 


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
