const createApp = require("./app");
const { InMemoryProjectStore } = require("./store");

const PORT = Number(process.env.PORT) || 4000;

const store = new InMemoryProjectStore();
const app = createApp({ store });

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[Scheduly] API server (in-memory) listening on http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  store
};
