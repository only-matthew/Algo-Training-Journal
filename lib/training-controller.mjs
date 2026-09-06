export function createTrainingController({ api, login, storage, createId = () => crypto.randomUUID() }) {
  const key = `journal-training-command-v1:${login}`;
  let pending = null;
  try { pending = JSON.parse(storage?.getItem(key) || "null"); } catch { /* unavailable storage */ }
  if (pending?.login !== login || !["profile", "plan", "action"].includes(pending?.type)) pending = null;
  let busy = false;
  const remember = () => {
    try { if (pending) storage?.setItem(key, JSON.stringify(pending)); else storage?.removeItem(key); } catch { /* retain in memory */ }
  };
  async function execute() {
    if (!pending || busy) return;
    busy = true;
    const command = pending;
    try {
      const options = { ...command.options, idempotencyKey: command.id };
      const result = command.type === "profile" ? await api.putProfile(command.body, options)
        : command.type === "plan" ? await api.putPlan(command.date, command.body, options)
          : await api.planAction(command.body, options);
      pending = null;
      remember();
      return result;
    } catch (error) {
      // Network/5xx outcomes are uncertain. Keep the exact body and key so a
      // retry retrieves the original receipt instead of creating another write.
      if (error.status >= 400 && error.status < 500 && error.status !== 429) { pending = null; remember(); }
      throw error;
    } finally { busy = false; }
  }
  return {
    get pending() { return pending; },
    get busy() { return busy; },
    retry: execute,
    async save(type, body, { revision, date } = {}) {
      if (pending || busy) throw new Error("上次保存尚未确认，请先重试确认。");
      pending = { login, id: createId(), type, body: structuredClone(body), date, options: type === "action" ? {} : { revision } };
      remember();
      return execute();
    },
  };
}
