export class InvalidMigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidMigrationError";
  }
}
