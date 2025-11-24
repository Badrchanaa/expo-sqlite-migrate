//#region src/migrations.ts
var Table = class {
	fieldNames;
	_fields;
	name;
	constructor(tableName) {
		this.name = tableName;
		this.fieldNames = /* @__PURE__ */ new Set();
		this._fields = new Array();
	}
	addField(name, type, constraints = 0) {
		if (this.fieldNames.has(name)) throw new Error(`table already has field ${name}`);
		this._fields.push({
			name,
			type,
			constraints
		});
		this.fieldNames.add(name);
		return this;
	}
	get fields() {
		return this._fields;
	}
	create() {
		return "";
	}
	update() {
		return "";
	}
	drop() {
		return "";
	}
};

//#endregion
export { Table };
//# sourceMappingURL=index.js.map