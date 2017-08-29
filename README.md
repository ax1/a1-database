# a1-database

Zero installation JSON database.

## Usage

The database is a [NEDB](https://www.npmjs.com/package/nedb), but with promisified methods already. The callback methods are still available for edge cases. Example: if the calback method is `ìnsert()`, the promised version is `insertAsync()`.

No database installation is required because all data is stored in one single file. Perfect for development!.

```javascript
const database = require('a1-database')

async function test() {
  try {
    const item = { name: 'tone', age: 36 }
    const db = await database.start(__dirname + '/test.json')
    await db.insertAsync(item)
    const items = await db.findAsync({ name: item.name })
    item.age = 37
    await db.updateAsync({ name: item.name }, item)
    await db.removeAsync({ name: item.name })
    // or delete everything
    await db.removeAsync({}, { multi: true })
  } catch (err) {
    console.error()
  }
}

test()
```

More info and examples: check [NEDB](https://www.npmjs.com/package/nedb) and then use the promisified version of the methods.
