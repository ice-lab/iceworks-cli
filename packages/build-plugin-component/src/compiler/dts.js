/**
 * @file get the DTS for TS files.
 * @author tony7lee
 */

const path = require('path');
const fse = require('fs-extra');
const ts = require('typescript');
const { REG_TS } = require('../configs/reg');

// compile options
const options = {
  allowJs: true,
  declaration: true,
  emitDeclarationOnly: true,
};

module.exports = function dtsCompiler(compileInfo, log = console) {
  const needCompileList = compileInfo.filter(({ filePath }) => REG_TS.test(filePath)).map((data) => {
    const { filePath, destPath, sourceFile } = data;
    const targetPath = path.join(destPath, filePath.replace(REG_TS, '.d.ts'));
    const fileNamesDTS = sourceFile.replace(REG_TS, '.d.ts');
    return {
      ...data,
      targetPath,
      fileNamesDTS,
    };
  });

  if (needCompileList.length === 0) {
    return;
  }
  log.info('Compiling ts declaration ...');
  // Create a Program with an in-memory emit
  let createdFiles = {};
  const host = ts.createCompilerHost(options);
  host.writeFile = (fileName, contents) => { createdFiles[path.resolve(fileName)] = contents; };

  // Prepare and emit the d.ts files
  const program = ts.createProgram(needCompileList.map(({ sourceFile }) => sourceFile), options, host);
  const emitResult = program.emit();
  if (emitResult.diagnostics && emitResult.diagnostics.length > 0) {
    emitResult.diagnostics.forEach(diagnostic => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      if (diagnostic.file) {
        const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
        log.error(`${diagnostic.file.fileName} (${line + 1}, ${character + 1}): ${message}`);
      } else {
        log.error(message);
      }
    });
  }

  needCompileList.forEach(({ targetPath, fileNamesDTS }) => {
    const content = createdFiles[fileNamesDTS];
    // write file
    if (content) {
      fse.ensureDirSync(path.dirname(targetPath));
      fse.writeFileSync(targetPath, content, 'utf-8');
    }
  });

  // release
  createdFiles = null;
};
