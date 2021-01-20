export default () => {
  return `
    const raxServerRenderer = require('rax-app-renderer/lib/server').default;
    const { req, res } = ctx;
    const search = req.search;
    const parsedQuery = qs.parse(search);
    const pathname = req.path;
    const location = { pathname, search, state: null };
    const initialContext = {
      req,
      res,
      pathname,
      query: parsedQuery,
      location,
    };

    if (!data.initialData) {
      data.initialData = appConfig.app && appConfig.app.getInitialData ? await appConfig.app.getInitialData(initialContext) : {};
    }

    pageHTML = raxServerRenderer({ initialContext }, {
        staticConfig,
        routes: staticConfig.routes,
        InitialComponent: Component,
        context: data,
        history: {
          location
        }
    }, {
      appConfig,
      createBaseApp,
      emitLifeCycles
    });
  `;
};
