# expo-sqlite-migrate
A simple lightweight React Native and Expo migrations library for local sqlite databases. 

# WIP
## Core Features
- [x] Migrator class with factory pattern (`Migrator.create()`)
- [x] Migration tracking table with timestamps
- [x] Migration status tracking (REGISTERED, APPLIED, ROLLBACK, FAILED)
- [x] Migration validation (duplicate ID detection)
- [x] Automatic retry of failed migrations
- [x] Migration rollback (current session only)
- [ ] Migration rollback (persistent across app restarts)
- [ ] Migration checksums/integrity verification
- [ ] Dry run / preview mode
- [ ] Batch rollback (multiple migrations at once)
- [ ] Custom migration table name

## Query Generator & Table Builder
- [x] Fluent API (`Table.addField().addField().create()`)
- [x] Table name validation (quoted and unquoted)
- [x] CREATE TABLE generation
- [x] DROP TABLE generation
- [ ] ALTER TABLE (add column)
- [ ] ALTER TABLE (rename column)
- [ ] ALTER TABLE (drop column)
- [ ] CREATE INDEX
- [ ] DROP INDEX

## Field Types
- [x] `int` / INTEGER
- [x] `text`
- [x] `float`
- [x] `varchar(n)`
- [ ] `blob`
- [ ] `boolean` (as INTEGER 0/1)
- [ ] `datetime` / `timestamp`

## Constraints
- [x] PRIMARY KEY
- [x] NOT NULL
- [x] UNIQUE
- [x] Foreign keys (REFERENCES)
- [ ] DEFAULT value
- [ ] CHECK constraint
- [ ] AUTOINCREMENT
- [x] ON DELETE / ON UPDATE actions (CASCADE, SET NULL, etc.)
- [ ] Composite primary keys
- [ ] Composite unique constraints

## Adapters
- [x] sqlite3 adapter (Node.js)
- [x] expo-sqlite adapter
- [x] Transaction support
- [x] `run()` - execute queries
- [x] `getFirst()` - prepared queries
- [x] `getAll()` - prepared queries
- [x] `runPrepared()` - prepared write queries
- [ ] react-native-sqlite-storage adapter

## Documentation
- [x] Basic README
- [x] Installation instructions
- [x] Quick start guide
- [ ] API reference
- [ ] Migration examples
- [ ] TypeScript usage examples
- [ ] Expo setup guide
- [ ] Troubleshooting guide

## Testing
- [x] sqlite3 adapter tests
- [x] Migration table creation tests
- [x] Migration failure handling tests
- [x] Primary key validation tests
- [x] Foreign key tests
- [ ] Rollback tests - **missing persistent rollback queries**
- [ ] expo-sqlite adapter tests
- [ ] react-native-sqlite-storage adapter tests
- [ ] Integration tests with real Expo app

## Developer Experience
- [ ] Migration file generator script
- [ ] Migration status debug hook/component
- [ ] Schema export utility
- [ ] Build-time migration validation
- [ ] Better error messages with context
- [ ] Configurable logging interface

## Package & Distribution
- [ ] npm package published
- [ ] Changelog
- [ ] GitHub issue templates

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
