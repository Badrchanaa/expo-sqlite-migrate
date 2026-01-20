//#region src/query-generator.ts
var QueryGenerator = class {
	static getFieldConstraints(field) {
		const constraints = field.constraints;
		if (!constraints) return "";
		const parts = [];
		if (constraints & Constraint.PRIMARY_KEY) parts.push("PRIMARY KEY");
		if (constraints & Constraint.NOT_NULL) parts.push("NOT NULL");
		if (constraints & Constraint.UNIQUE) parts.push("UNIQUE");
		return parts.join(" ");
	}
	static generateFieldSQL(field) {
		const fieldType = field.type === "int" ? "INTEGER" : field.type;
		const constraints = this.getFieldConstraints(field);
		if (!constraints) return `${field.name} ${fieldType}`;
		return `${field.name} ${fieldType} ${constraints}`;
	}
	static createTable(table) {
		const fields = Array.from(table.fields);
		if (fields.length === 0) throw new Error("can not create a table with no fields");
		const fieldsSQL = fields.map((field) => this.generateFieldSQL(field));
		if (table.foreignKeys) {
			const fkSQL = [...table.foreignKeys].map((fk) => fk.SQL());
			fieldsSQL.push(...fkSQL);
		}
		return `CREATE TABLE IF NOT EXISTS ${table.name}(${fieldsSQL.join(",\n")});`;
	}
	static updateTable(table) {}
	static dropTable(name) {
		return `DROP TABLE ${name};`;
	}
};

//#endregion
//#region src/migrations.ts
let Constraint = /* @__PURE__ */ function(Constraint$1) {
	Constraint$1[Constraint$1["NONE"] = 0] = "NONE";
	Constraint$1[Constraint$1["PRIMARY_KEY"] = 2] = "PRIMARY_KEY";
	Constraint$1[Constraint$1["UNIQUE"] = 4] = "UNIQUE";
	Constraint$1[Constraint$1["NOT_NULL"] = 8] = "NOT_NULL";
	return Constraint$1;
}({});
/**
* Drop a database table
*
* [Use with caution:] this permanently removes the database table and its data.
* @param tableName - database table to drop
*/
function DropTable(tableName) {
	return QueryGenerator.dropTable(tableName);
}
var ForeignKey = class {
	constructor(refTable, references, onUpdate, onDelete, deferred = false) {
		this.refTable = refTable;
		this.references = references;
		this.onUpdate = onUpdate;
		this.onDelete = onDelete;
		this.deferred = deferred;
	}
	SQL() {
		const entries = Object.entries(this.references);
		const childKey = entries.map(([col]) => `"${col}"`).join(", ");
		const parentKey = entries.map(([, refCol]) => `"${refCol}"`).join(", ");
		const parts = [`FOREIGN KEY(${childKey}) REFERENCES ${this.refTable}(${parentKey})`];
		if (this.onUpdate) parts.push(`ON UPDATE ${this.onUpdate}`);
		if (this.onDelete) parts.push(`ON DELETE ${this.onDelete}`);
		if (this.deferred) parts.push("DEFERRABLE INITIALLY DEFERRED");
		return parts.join(" ");
	}
};
var Table = class Table {
	fieldsMap = /* @__PURE__ */ new Map();
	hasPk = false;
	name;
	_foreignKeys = /* @__PURE__ */ new Map();
	constructor(tableName) {
		this.validateTableName(tableName);
		this.name = tableName.toLowerCase();
	}
	get fieldNames() {
		return this.fieldsMap.keys();
	}
	addField(name, type, constraints = 0) {
		name = name.toLowerCase();
		if (this.fieldsMap.has(name)) throw new Error(`table fields can not have the same name ${name}`);
		const isPk = constraints & Constraint.PRIMARY_KEY;
		if (isPk && this.hasPk) throw new Error(`table cannot have more than one primary key`);
		if (isPk) this.hasPk = true;
		this.fieldsMap.set(name, {
			name,
			type,
			constraints
		});
		return this;
	}
	addForeignKey(refTable, references, options) {
		const tableName = (refTable instanceof Table ? refTable.name : refTable).toLowerCase();
		const sortedEntries = Object.entries(references).sort(([a], [b]) => a.localeCompare(b, void 0, { sensitivity: "base" }));
		const columns = new Set(sortedEntries.map(([col]) => col.toLowerCase()));
		const refColumns = new Set(sortedEntries.map(([, refCol]) => refCol.toLowerCase()));
		if (sortedEntries.length === 0) throw new Error("Foreign key must reference at least one column");
		if (refTable instanceof Table && refColumns.difference(new Set(refTable.fieldNames)).size !== 0) throw new Error("Foreign key referenced column(s) does not exist on referenced table");
		if (columns.difference(new Set(this.fieldNames)).size !== 0) throw new Error("Foreign key column(s) does not exist on table");
		const fk = new ForeignKey(tableName, references, options?.onUpdate, options?.onDelete, options?.deferred ?? false);
		let key = tableName + "\0";
		for (const [col, refCol] of sortedEntries) key += `\0${col.toLowerCase()}:\0${refCol.toLowerCase()}`;
		if (this._foreignKeys.has(key)) throw new Error("Foreign key already exists");
		this._foreignKeys.set(key, fk);
		return this;
	}
	get foreignKeys() {
		return this._foreignKeys.values();
	}
	get fields() {
		return this.fieldsMap.values();
	}
	create() {
		return QueryGenerator.createTable(this);
	}
	update() {
		return "";
	}
	validateTableName(name) {
		if (name.length === 0) throw new Error("Invalid empty table name");
		const quotedMatch = name.match(/^["`\[](.+)["`\]]$/);
		if (quotedMatch) {
			if (quotedMatch[1].includes(name[0] === "[" ? "]" : name[0])) throw new Error("Invalid table name: inner content contains quote character");
			return;
		}
		if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Invalid table name: unquoted table name can only contain alphanumeric and underscore characters");
	}
};

//#endregion
//#region src/error.ts
var InvalidMigrationError = class extends Error {
	constructor(message) {
		super(message);
		this.name = "InvalidMigrationError";
	}
};

//#endregion
//#region src/adapters/BaseAdapter.ts
var BaseAdapter = class {
	db;
	constructor(db) {
		this.db = db;
	}
};

//#endregion
//#region src/utils/promisify.ts
function promisify(fn, context) {
	return (...args) => {
		return new Promise((resolve, reject) => {
			try {
				fn.call(context, ...args, (err, result) => {
					if (err) reject(err);
					else resolve(result);
				});
			} catch (e) {
				reject(e);
			}
		});
	};
}

//#endregion
//#region src/adapters/Sqlite3Adapter.ts
var TransactionType = /* @__PURE__ */ function(TransactionType$1) {
	TransactionType$1["DEFERRED"] = "DEFERRED";
	TransactionType$1["IMMEDIATE"] = "IMMEDIATE";
	TransactionType$1["EXCLUSIVE"] = "EXCLUSIVE";
	return TransactionType$1;
}(TransactionType || {});
var Sqlite3Adapter = class extends BaseAdapter {
	constructor(db) {
		super(db);
	}
	async run(query) {
		console.log("[SQLite3Adapter] run query:", query);
		return new Promise((resolve, reject) => {
			try {
				this.db.run(query, (err) => {
					if (err) reject(err);
					else resolve();
				});
			} catch (e) {
				reject(e);
			}
		});
	}
	async runPrepared(query, params) {
		return new Promise((resolve, reject) => {
			try {
				const stmt = this.db.prepare(query, params);
				stmt.run((err) => {
					stmt.finalize();
					if (err) reject(err);
					else resolve();
				});
			} catch (e) {
				reject(e);
			}
		});
	}
	async getAll(source, ...params) {
		console.log("[SQLite3Adapter] get query:", source, params);
		return promisify(this.db.all, this.db)(source, ...params);
	}
	async transaction(queries, transactionType = TransactionType.IMMEDIATE) {
		await this.run(`BEGIN ${transactionType} TRANSACTION`);
		try {
			for (const query of queries) if (typeof query === "string") await this.run(query);
			else await this.runPrepared(query.sql, query.params);
			await this.run("COMMIT");
		} catch (err) {
			console.error("[Transaction error]: ", err);
			console.log("ROLLING BACK");
			await this.run("ROLLBACK").catch((e) => console.error("ROLLBACK FAILED", e));
			throw err;
		}
	}
	async getFirst(source, ...params) {
		return promisify(this.db.get, this.db)(source, ...params);
	}
};

//#endregion
//#region src/adapters/ExpoAdapter.ts
var ExpoAdapter = class extends BaseAdapter {
	constructor(db) {
		super(db);
	}
	async run(query) {
		return this.db.execAsync(query);
	}
	async runPrepared(query, params) {
		const statement = await this.db.prepareAsync(query);
		try {
			await statement.executeAsync(params);
		} finally {
			await statement.finalizeAsync();
		}
	}
	async getAll(source, ...params) {
		return this.db.getAllAsync(source, ...params);
	}
	async getFirst(source, ...params) {
		return this.db.getFirstAsync(source, ...params);
	}
	async transaction(queries) {
		return this.db.withExclusiveTransactionAsync(async (tx) => {
			for (const query of queries) if (typeof query === "string") await tx.execAsync(query);
			else {
				const statement = await tx.prepareAsync(query.sql);
				try {
					await statement.executeAsync(query.params);
				} finally {
					await statement.finalizeAsync();
				}
			}
		});
	}
};

//#endregion
//#region src/migrator.ts
let MigrationStatus = /* @__PURE__ */ function(MigrationStatus$1) {
	MigrationStatus$1[MigrationStatus$1["REGISTERED"] = 0] = "REGISTERED";
	MigrationStatus$1[MigrationStatus$1["APPLIED"] = 1] = "APPLIED";
	MigrationStatus$1[MigrationStatus$1["ROLLBACK"] = 2] = "ROLLBACK";
	MigrationStatus$1[MigrationStatus$1["FAILED"] = 3] = "FAILED";
	return MigrationStatus$1;
}({});
const adapters = {
	"expo-sqlite": ExpoAdapter,
	sqlite3: Sqlite3Adapter
};
var Migrator = class Migrator {
	_db;
	appliedMigrations = /* @__PURE__ */ new Map();
	constructor(db, type) {
		this._db = new adapters[type](db);
	}
	static async create(db, type) {
		const migrator = new Migrator(db, type);
		await migrator.initMigrationTable();
		return migrator;
	}
	async initMigrationTable() {
		const unixEpochMs = "(julianday('now') - 2440587.5) * 86400000";
		await this._db.transaction([
			`
  CREATE TABLE IF NOT EXISTS migrations(
    id TEXT NOT NULL UNIQUE,
    status INTEGER DEFAULT ${MigrationStatus.REGISTERED},
    created_at INTEGER DEFAULT (${unixEpochMs}),
    updated_at INTEGER DEFAULT (${unixEpochMs}),
    PRIMARY KEY(id)
  ) WITHOUT ROWID;
  `,
			`
  CREATE TRIGGER IF NOT EXISTS migrations_updated_at
  AFTER UPDATE ON migrations
  FOR EACH ROW
  BEGIN
      UPDATE migrations
      SET updated_at = ${unixEpochMs}
      WHERE id = OLD.id;
  END;
  `,
			`
  CREATE INDEX IF NOT EXISTS applied_index ON migrations(status) WHERE status=${MigrationStatus.APPLIED};
  `
		]);
	}
	async getMigrationRecord(migrationId) {
		return await this._db.getFirst(`SELECT id, status FROM migrations WHERE id = ?`, migrationId);
	}
	/**
	* Applies a single migration to the database.
	*
	* @param migration - The migration object containing SQL statements and metadata.
	* @param migrationRecord - The record of the migration in the database, or null if none.
	* @returns `true` if the migration was applied successfully, `false` otherwise.
	*/
	async applyMigration(migration, migrationRecord) {
		if (!migrationRecord) await this._db.runPrepared("INSERT INTO migrations (id, status) values (?, ?);", [migration.id, String(MigrationStatus.REGISTERED)]);
		else {
			if (migrationRecord.status === MigrationStatus.APPLIED) return true;
			if (migrationRecord.status === MigrationStatus.FAILED) console.log("Retrying failed migration " + migrationRecord.id);
			if (migrationRecord.status === MigrationStatus.REGISTERED) console.warn("migration already registered " + migrationRecord.id);
		}
		try {
			const queries = [...migration.up(), {
				sql: "UPDATE migrations SET status = ? WHERE id = ?",
				params: [String(MigrationStatus.APPLIED), migration.id]
			}];
			await this._db.transaction(queries);
			return true;
		} catch (e) {
			if (e instanceof Error) console.log("migration failed with error:", e.message);
			await this._db.runPrepared("UPDATE migrations SET status = ? WHERE id = ?", [String(MigrationStatus.FAILED), migration.id]);
			return false;
		}
	}
	validateMigrations(migrations) {
		const processedMigrations = /* @__PURE__ */ new Set();
		for (const migration of migrations) {
			if (processedMigrations.has(migration.id)) throw new InvalidMigrationError("migrations cannot have same ID");
			processedMigrations.add(migration.id);
		}
	}
	/**
	* Apply and track list of migrations.
	*
	* Note: if a migration fails, all subsequent migrations will not be applied.
	*
	* @param migrations - A list of migrations
	* @returns A list of successfully applied migrations
	*
	*/
	async migrate(migrations) {
		const migrated = [];
		try {
			this.validateMigrations(migrations);
			for (const migration of migrations) {
				const migrationRecord = await this.getMigrationRecord(migration.id);
				if (!await this.applyMigration(migration, migrationRecord)) break;
				console.log("migration successful");
				this.appliedMigrations.set(migration.id, migration);
				migrated.push(migration.id);
			}
		} catch (e) {
			if (e instanceof InvalidMigrationError) console.error("Invalid migration:", e);
			throw e;
		}
		return migrated;
	}
	async rollback() {
		const DBRecord = await this._db.getFirst(`SELECT * FROM migrations WHERE status=${MigrationStatus.APPLIED} ORDER BY updated_at DESC LIMIT 1`);
		if (!DBRecord) {
			console.warn("no current applied migration");
			return null;
		}
		const appliedMigration = {
			...DBRecord,
			created_at: new Date(DBRecord.created_at),
			updated_at: new Date(DBRecord.updated_at)
		};
		const migration = this.appliedMigrations.get(appliedMigration.id);
		if (!migration) throw new Error(`Applied migration ${appliedMigration.id} has no code definition`);
		const queries = [...migration.down(), {
			sql: "UPDATE migrations SET status = ? WHERE id = ?",
			params: [String(MigrationStatus.ROLLBACK), migration.id]
		}];
		await this._db.transaction(queries);
		this.appliedMigrations.delete(migration.id);
		return migration.id;
	}
};

//#endregion
export { Constraint, DropTable, Migrator, Table };
//# sourceMappingURL=index.js.map