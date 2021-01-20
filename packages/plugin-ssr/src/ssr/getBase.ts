import { GET_RAX_APP_WEBPACK_CONFIG } from '../constants';

export default function (api) {
  const { getValue, context: { userConfig: { inlineStyle } } } = api;
  const getWebpackBase = getValue(GET_RAX_APP_WEBPACK_CONFIG);
  const config = getWebpackBase(api, {
    target: 'ssr',
    babelConfigOptions: { styleSheet: inlineStyle },
    progressOptions: {
      name: 'SSR',
    },
  });
  config.name('node');
  config.taskName = 'ssr';
  return config;
}
