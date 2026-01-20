# expo-sqlite-migrate
A simple lightweight React Native and Expo migrations library for local sqlite databases. 

## Installation

```sh
npm install expo-sqlite-migrate
```

## Quick start (sqlite3)

```ts
import { Database } from "sqlite3";
import { Migrator } from "expo-sqlite-migrate";
import { Constraint, DropTable, Table } from "expo-sqlite-migrate";

const db = new Database(":memory:");
const migrator = await Migrator.create(db, "sqlite3");

await migrator.migrate([
  {
    id: "create-users",
    up: () => [
      new Table("users")
        .addField("id", "int", Constraint.PRIMARY_KEY)
        .addField("name", "text", Constraint.NOT_NULL)
        .create(),
    ],
    down: () => [DropTable("users")],
  },
]);

await migrator.rollback();
```

## Quick start (expo-sqlite)

```ts
import * as SQLite from "expo-sqlite";
import { Migrator } from "expo-sqlite-migrate";
import { Constraint, DropTable, Table } from "expo-sqlite-migrate";

const db = SQLite.openDatabase("app.db");
const migrator = await Migrator.create(db, "expo-sqlite");

await migrator.migrate([
  {
    id: "create-users",
    up: () => [
      new Table("users")
        .addField("id", "int", Constraint.PRIMARY_KEY)
        .addField("name", "text", Constraint.NOT_NULL)
        .create(),
    ],
    down: () => [DropTable("users")],
  },
]);
```

## Expo integration test app

See `examples/expo-integration` for a minimal Expo app that runs an
integration test on launch and displays PASS/FAIL.

## API reference (minimal)

### Migrator

- `Migrator.create(db, type)` → `Promise<Migrator>`: initializes the migrations table.
- `migrator.migrate(migrations)` → `Promise<string[]>`: applies pending migrations in order.
- `migrator.rollback()` → `Promise<string | null>`: rolls back the latest applied migration from the current session.

### Migration

Each migration object must include:

- `id`: unique string identifier
- `up()`: returns an array of SQL queries or prepared statements
- `down()`: returns an array of SQL queries or prepared statements

### Table builder

- `new Table(name)`
- `.addField(name, type, ...constraints)`
- `.addForeignKey(parentTableOrName, childToParentMap, options?)`
- `.create()` → SQL

### Constraints

- `Constraint.PRIMARY_KEY`
- `Constraint.NOT_NULL`
- `Constraint.UNIQUE`

### Utilities

- `DropTable(name)` → SQL
