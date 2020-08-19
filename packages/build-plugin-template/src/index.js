/* eslint-disable import/no-dynamic-require */
/* eslint-disable global-require */
const path = require('path');
const glob = require('glob');
const { getWebpackConfig, getJestConfig } = require('build-scripts-config');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ejsRender = require('./ejsRender');

const formatPath = (outputPath) => {
  const isWin = process.platform === 'win32';
  // js\index.js => js/index.js
  return isWin ? outputPath.replace(/\\/g, '/') : outputPath;
};

module.exports = ({ context, log, registerTask,registerUserConfig,onGetWebpackConfig,onGetJestConfig }) => {
  const { rootDir, command, pkg } = context;
  const mode = command === 'start' ? 'development' : 'production';
  const defaultConfig = getWebpackConfig(mode);
  const mockData = require(path.join(rootDir,'config','mock'));

  // ejs 模板通过接下来的步骤渲染至 .tmp 文件夹。
  // 之后我们遍从 .tmp 中的 index 进行读取。
  const sourceDir = path.join(rootDir,'src');
  const tmpDir = path.join(rootDir,'.tmp');
  ejsRender(sourceDir,tmpDir,mockData,log);

  // log.info('defaultConfig',defaultConfig);
  registerTask('page',defaultConfig);

  const defaultFilename = '[name].js';
  // register config outputAssetsPath for compatiable with plugin-fusion-material
  registerUserConfig({
    name: 'outputAssetsPath',
    validation: 'object',
    defaultValue: { js: '', css: '' },
    configWebpack: (config, outputAssetsPath) => {
      // log.info('config',config,'outputAssetsPath',outputAssetsPath);
      config.output.filename(formatPath(path.join(outputAssetsPath.js || '', defaultFilename)));
      if (config.plugins.get('MiniCssExtractPlugin')) {
        // log.info('config.plugin get MinCssExtractPlugin');
        const options = config.plugin('MiniCssExtractPlugin').get('args')[0];
        config.plugin('MiniCssExtractPlugin').tap((args) => [Object.assign(...args, {
          filename: formatPath(path.join(outputAssetsPath.css || '', options.filename)),
        })]);
      }
    },
  });
  onGetWebpackConfig((config) => {
    // modify HtmlWebpackPlugin
    config.plugin('HtmlWebpackPlugin').use(HtmlWebpackPlugin, [{
      inject: true,
      template: require.resolve('./template/index.html'),
      minify: false,
      templateParameters: {
        demoTitle: pkg.blockConfig && pkg.blockConfig.name || 'ICE PAGE TEMPLATE',
      },
    }]);
    config.output.filename(defaultFilename);
    const outputPath = path.resolve(rootDir, 'build');
    config.output.path(outputPath);
    // add custom entry file
    config.merge({
      entry: {
        index: [require.resolve('./template/page.entry.js')],
      },
    });

    // default devServer config
    config.merge({
      devServer: {
        disableHostCheck: true,
        compress: true,
        clientLogLevel: 'none',
        hot: true,
        publicPath: '/',
        quiet: true,
        watchOptions: {
          ignored: /node_modules/,
          aggregateTimeout: 600,
        },
        before(app) {
          app.use((req, res, next) => {
            // set cros for all served files
            res.set('Access-Control-Allow-Origin', '*');
            next();
          });
        },
      },
    });

    // update publicPath ./
    config.output.publicPath('./');
    ['scss', 'scss-module', 'css', 'css-module', 'less', 'less-module'].forEach((rule) => {
      if (config.module.rules.get(rule)) {
        config.module.rule(rule).use('MiniCssExtractPlugin.loader').tap(() => ({ publicPath: '../' }));
      }
    });

    config.resolve.modules.add('node_modules');
    config.resolve.modules.add(path.join(rootDir, 'node_modules'));
    // check demo file
    const demoFiles = glob.sync('{demo/index.{js,jsx,ts,tsx},demo.{js,jsx,ts,tsx}}', {
      cwd: rootDir,
    });
    const hasDemoFile = demoFiles.length > 0;
    // add alias for load Block component
    config.merge({
      resolve: {
        alias: {
          '@/page': path.join(rootDir, hasDemoFile ? 'demo' : '.tmp/index.tsx'),
        },
      },
    });

    // add exclude rule for compile template/ice.page.entry.js
    ['jsx', 'tsx'].forEach((rule) => {
      config.module
        .rule(rule)
        .exclude
        .clear()
        .add(/node_modules(?!.+page.entry.js)/);
    });
    config.module.rule('ejs')
      .test(/\.ejs/)
      .pre()
      .include
      .add(path.join(rootDir,'src'))
      .end()
      .use('ejs')
      .loader('ejs-loader?isShowUser=true')
      .options({esModule:false})
  });
  if (command === 'test') {
    // jest config
    onGetJestConfig((jestConfig) => {
      const { moduleNameMapper, ...rest } = jestConfig;
      const defaultJestConfig = getJestConfig({ rootDir, moduleNameMapper });
      return {
        ...defaultJestConfig,
        ...rest,
        // defaultJestConfig.moduleNameMapper already combine jestConfig.moduleNameMapper
        moduleNameMapper: defaultJestConfig.moduleNameMapper,
      };
    });
  }

};