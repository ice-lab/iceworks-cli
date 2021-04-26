const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const { configHTMLPlugin } = require('../../utils/htmlInjection');

module.exports = (config, { pkg, rootDir, entry, webpack }) => {
  config.target('web');
  config.context(rootDir);

  const isWebpack5 = webpack && Number(webpack.version.split('.')[0]) > 4;

  if (isWebpack5) {
    const { ModuleFederationPlugin } = webpack && webpack.container;

    config.plugin('mf').use(ModuleFederationPlugin, [
      {
        name: 'mfff',
        shared: {
          react: {
            singleton: true,
          },
          'react-dom': {
            singleton: true,
          },
        },
      },
    ]);
  }

  // modify entry
  config.entryPoints.clear();
  config.merge({ entry });

  config.plugin('HtmlWebpackPlugin').use(HtmlWebpackPlugin, [
    {
      template: require.resolve('../../template/demo.html'),
      filename: 'index.html',
    },
  ]);

  configHTMLPlugin(config);

  config.resolve.modules
    .add('node_modules')
    .add(path.join(rootDir, 'node_modules'))
    .add(path.resolve(__dirname, '../../node_modules'));

  ['jsx', 'tsx'].forEach((rule) => {
    config.module
      .rule(rule)
      .exclude.clear()
      .add(/node_modules(?!(.+_component_demo|.+build-plugin-component))/)
      .end()
      .use('babel-loader')
      .tap((options) => {
        const { plugins = [] } = options;
        return {
          ...options,
          plugins: [
            ...plugins,
            // only transform index entry
            [require.resolve('../../utils/babelPluginCorejsLock.js'), { fileList: [entry.index] }],
          ],
        };
      });
  });
  // disable vendor
  config.optimization.splitChunks({ cacheGroups: {} });
  // remove CopyWebpackPlugin (component compile do not have public folder)
  config.plugins.delete('CopyWebpackPlugin');
  // add demo loader
  config.module
    .rule('demo-loader')
    .test(/\.md$/i)
    .use('demo')
    .loader(require.resolve('../../webpackLoader/reactDemoLoader'));
  // add packagename to webpack alias
  ['.js', '.jsx', '.json', '.html', '.ts', '.tsx'].forEach((extension) => {
    config.resolve.extensions.add(extension);
  });
  config.resolve.alias.set(`${pkg.name}$`, path.resolve(rootDir, 'src/index'));

  config.module.rule('jsx').test(/\.jsx?$|\.md$/); // Issue: https://github.com/webpack/webpack/issues/4411
  config.output.filename('[name].js');
};
