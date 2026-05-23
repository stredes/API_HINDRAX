export class ConfigErrorStore {
  constructor(message) {
    this.message = message;
    this.storageStatus = "config_pending";
  }

  fail() {
    const error = new Error(this.message);
    error.status = 503;
    error.publicMessage = this.message;
    throw error;
  }

  upsertTask() {
    this.fail();
  }

  listTasks() {
    this.fail();
  }

  upsertInventory() {
    this.fail();
  }

  listInventory() {
    this.fail();
  }

  upsertDevice() {
    this.fail();
  }

  listDevices() {
    this.fail();
  }
}
