const { resolve, relative, join } = require('path');
const { readJsonSync, existsSync } = require('fs-extra');
const { RawSource } = require('webpack-sources');
const adjustCSS = require('./utils/adjustCSS');
const { MINIAPP, VENDOR_CSS_FILE_NAME, WECHAT_MINIPROGRAM } = require('./constants');
const adapter = require('./adapter');
const isCSSFile = require('./utils/isCSSFile');
const wrapChunks = require('./utils/wrapChunks');
const {
  generateAppCSS,
  generateAppJS,
  generateConfig,
  generateCustomComponent,
  generatePageCSS,
  generatePageJS,
  generatePageJSON,
  generatePageXML,
  generateRootTemplate,
  generateElementJS,
  generateElementJSON,
  generateElementTemplate,
  generateRender
} = require('./generators');

const PluginName = 'MiniAppRuntimePlugin';
const extRegex = /\.(css|js|wxss|acss)(\?|$)/;

class MiniAppRuntimePlugin {
  constructor(options) {
    this.options = options;
    this.target = options.target || MINIAPP;
  }

  apply(compiler) {
    const rootDir = __dirname;
    const options = this.options;
    const target = this.target;
    const { config = {}, nativeLifeCycleMap, routes = [], command } = options;
    let isFirstRender = true;

    // Execute when compilation created
    compiler.hooks.compilation.tap(PluginName, (compilation) => {
      // Optimize chunk assets
      compilation.hooks.optimizeChunkAssets.tapAsync(
        PluginName,
        (chunks, callback) => {
          wrapChunks(compilation, chunks);
          callback();
        }
      );
    });

    compiler.hooks.emit.tapAsync(PluginName, (compilation, callback) => {
      const outputPath = join(compilation.outputOptions.path, target);
      const sourcePath = join(options.rootDir, 'src');
      const customComponentConfig = config.nativeCustomComponent || {};
      const customComponentRoot =
        customComponentConfig.root &&
        resolve(options.rootDir, customComponentConfig.root);
      const customComponents = customComponentConfig.usingComponents || {};
      const pages = [];
      const assetsMap = {}; // page - asset
      const assetsReverseMap = {}; // asset - page
      const changedFiles = Object.keys(
        compiler.watchFileSystem.watcher.mtimes
      ).map((filePath) => {
        return filePath.replace(sourcePath, '');
      });

      // Collect asset
      routes
        .filter(({ entryName }) => {
          return isFirstRender || changedFiles.includes(entryName);
        })
        .forEach(({ entryName }) => {
          const assets = { js: [], css: [] };
          const filePathMap = {};
          const entryFiles = compilation.entrypoints.get(entryName).getFiles();
          entryFiles.forEach((filePath) => {
            // Skip non css or js
            const extMatch = extRegex.exec(filePath);
            if (!extMatch) return;

            const ext = isCSSFile(filePath) ? 'css' : extMatch[1];

            let relativeFilePath;
            // Adjust css content
            if (ext === 'css') {
              relativeFilePath = filePath;
              if (relativeFilePath !== `${target}/${VENDOR_CSS_FILE_NAME}`) {
                compilation.assets[
                  `${relativeFilePath}.${adapter[target].css}`
                ] = new RawSource(
                  adjustCSS(compilation.assets[relativeFilePath].source())
                );
                delete compilation.assets[`${relativeFilePath}`];
              }
            }
            relativeFilePath = relative(target, filePath);

            // Skip recorded
            if (filePathMap[relativeFilePath]) return;
            filePathMap[relativeFilePath] = true;

            // Record
            assets[ext].push(relativeFilePath);

            // Insert into assetsReverseMap
            assetsReverseMap[relativeFilePath] =
              assetsReverseMap[relativeFilePath] || [];
            if (assetsReverseMap[relativeFilePath].indexOf(entryName) === -1)
              assetsReverseMap[relativeFilePath].push(entryName);
          });

          assetsMap[entryName] = assets;
          let pageConfig = {};
          const pageConfigPath = resolve(outputPath, entryName + '.json');
          if (existsSync(pageConfigPath)) {
            pageConfig = readJsonSync(pageConfigPath);
          }

          const pageRoute = join(sourcePath, entryName);
          const nativeLifeCycles =
            nativeLifeCycleMap[pageRoute] || {};
          const route = routes.find(({ source }) => source === entryName);
          if (route.window && route.window.pullRefresh) {
            if (!nativeLifeCycles[pageRoute]) {
              nativeLifeCycles[pageRoute] = {};
            }
            nativeLifeCycles[pageRoute].onPullDownRefresh = true;
            // onPullIntercept only exits in wechat miniprogram
            if (target === WECHAT_MINIPROGRAM) {
              nativeLifeCycles[pageRoute].onPullIntercept = true;
            }
          }

          // xml/css/json file only need writeOnce
          if (isFirstRender) {
            // Page xml
            generatePageXML(compilation, entryName, {
              target,
              command,
              rootDir,
            });

            // Page json
            generatePageJSON(
              compilation,
              pageConfig,
              customComponentRoot,
              entryName,
              { target, command, rootDir }
            );

            // Page css
            generatePageCSS(compilation, assets, entryName, {
              target,
              command,
              rootDir,
            });
          }
          // Page js
          generatePageJS(
            compilation,
            assets,
            entryName,
            nativeLifeCycles,
            { target, command, rootDir }
          );

          // Record page path
          pages.push(entryName);
        });

      // Handle custom component
      Object.keys(customComponents).forEach((key) => {
        if (typeof customComponents[key] === 'string') {
          customComponents[key] = {
            path: customComponents[key],
          };
        }
      });

      // Collect app.js
      if (isFirstRender || changedFiles.includes('/app.js' || '/app.ts')) {
        const commonAppJSFilePaths = compilation.entrypoints
          .get('app')
          .getFiles()
          .filter((filePath) => !isCSSFile(filePath));
        // App js
        generateAppJS(compilation, commonAppJSFilePaths, {
          target,
          command,
          rootDir,
        });
      }

      if (
        isFirstRender ||
        changedFiles.some((filePath) => isCSSFile(filePath))
      ) {
        generateAppCSS(compilation, { target, command, rootDir });
      }

      // These files only need write when first render
      if (isFirstRender) {
        // render.js
        generateRender(compilation, { target, command, rootDir });

        // Config js
        generateConfig(compilation, options || {}, {
          target,
          command,
          rootDir,
        });

        // Custom-component
        generateCustomComponent(
          compilation,
          customComponentRoot,
          customComponents,
          outputPath,
          { target, command, rootDir }
        );

        if (target !== MINIAPP) {
          // Generate root template xml
          generateRootTemplate(compilation, {
            target,
            command,
            rootDir,
          });
          // Generate self loop element
          generateElementJS(compilation, {
            target,
            command,
            rootDir,
          });
          generateElementJSON(compilation, {
            target,
            command,
            rootDir,
          });
          generateElementTemplate(compilation, {
            target,
            command,
            rootDir,
          });
        }
      }

      callback();
    });
  }
}

module.exports = MiniAppRuntimePlugin;
