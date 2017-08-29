const persistence = require('../lib/index')

async function test() {
  try {
    const item = { name: 'tone', age: 36 }
    const db = await persistence.start(__dirname + '/test.json')
    // some operations
    console.log(await db.insertAsync(item))
    console.log(await db.findAsync({ name: item.name }))
    item.age = 37
    console.log(await db.updateAsync({ name: item.name }, item))
    console.log(await db.removeAsync({ name: item.name }))
    // delete everything
    console.log(await db.removeAsync({}, { multi: true }))
  } catch (err) {
    console.error()
  }
}

test()
