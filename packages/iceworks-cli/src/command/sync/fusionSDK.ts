import * as inquirer from 'inquirer';
import axios, { AxiosRequestConfig } from 'axios';
import * as ora from 'ora';
import * as _ from 'lodash';
import * as chalk from 'chalk';
import log from '../../utils/log';

export default class FusionSDK {

  private syncToAli: boolean;

  private fusionHost: string;

  constructor(options) {
    this.syncToAli = options.syncToAli;

    const envToInternalHost = {
      daily: 'https://fusion.alibaba.net',
      pre: 'https://pre-fusion.alibaba-inc.com',
      prod: 'https://fusion.alibaba-inc.com',
    };
    const envToOutHost = {
      daily: 'https://fusion.taobao.net',
      pre: 'https://pre-www.fusion.design',
      prod: 'https://fusion.design',
    };

    if (this.syncToAli) {
      this.fusionHost = envToInternalHost[options.env] || envToInternalHost.prod;
    } else {
      this.fusionHost = envToOutHost[options.env] || envToOutHost.prod;
    }
  }

  public async getToken() {
    const helpUrl = `${this.fusionHost}/help.html#/dev-create-site`;
    console.log();
    console.log(`如果这是你第一次使用该功能，或者不知道如何获取 token。\n请查看文档: ${chalk.yellow(helpUrl)}`);
    console.log();

    const { token } = await inquirer.prompt([
      {
        name: 'token',
        message: `Please input your ${this.fusionHost} token: `,
        validate(value) {
          if (!value) {
            return 'token cannot be empty';
          }
          return true;
        },
        filter(value) {
          return value.trim();
        },
      },
    ]);

    return token;
  }

  public async getSite(token) {
    const options = {
      method: 'GET',
      url: `${this.fusionHost}/api/v1/mysites`,
      headers: {
        'x-auth-token': token,
      },
    };

    log.verbose('fetch fusion sites start', options as any);
    const { data: body } = await requestFusion(options, this.fusionHost);
    log.verbose('fetch fusion sites success', body);

    const sites = body.data;

    if (!body.success) {
      throw new Error(body.message || '获取站点列表接口异常');
    }

    if (!sites || !sites.length) {
      console.log();
      console.log();
      console.log('获取站点失败。您可以自己创建一个站点或者请其他站点把您添加为成员');
      console.log(`创建站点文档: ${chalk.yellow(`${this.fusionHost}/help.html#/dev-create-site`)}`);
      console.log(`添加成员文档: ${chalk.yellow(`${this.fusionHost}/help.html#/site-user-management`)}`);
      console.log();
      console.log();
      throw new Error(body.message || '站点列表为空');
    }

    const { site } = await inquirer.prompt([
      {
        type: 'list',
        name: 'site',
        message: 'Please select your site:',
        choices: sites.map((item) => ({
          value: item,
          name: item.name,
        })),
      },
    ]);

    return {
      id: site.id,
      name: site.name,
      url: `${this.fusionHost}/api/v1/sites/${site.id}/materials`,
    };
  }

  public async uploadMaterialsData(fusionToken, fusionSite, materialsData) {
    const url = `${this.fusionHost}/api/v1/sites/${fusionSite.id}/materials`;
    const total = materialsData.length;
    let index = 0;

    const uploadMatetial = async (materialData) => {
      const getData = (materialType) => {
        return materialData.filter(item => item.type === materialType).map(item => `${item.npm}@${item.version}`);
      };

      const data = {
        blocks: getData('block'),
        scaffolds: getData('scaffold'),
        components: getData('component'),
      };

      const { data: body } = await requestFusion({
        url,
        data,
        headers: {
          'x-auth-token': fusionToken,
        },
        method: 'PATCH',
      }, this.fusionHost);

      if (!body.success) {
        (body.data || []).forEach((fail) => log.error('FusionSDK:', `物料 ${fail.npm} 上传失败, 原因: ${fail.reason}`));
        throw new Error('物料上传失败');
      }
    };

    const spinner = ora(`Sync to ${url}, Now: 0/${total}`).start();
    try {
      const concurrency = 4; // 每次请求同步的物料个数
      const groupData = _.chunk(materialsData, concurrency);

      // eslint-disable-next-line no-restricted-syntax
      for (const groupItem of groupData) {
        // eslint-disable-next-line no-await-in-loop
        await uploadMatetial(groupItem);
        index += concurrency;
        spinner.text = `Sync to ${url}, Now: ${index}/${total}`;
      }
      spinner.succeed('物料上传完成！');

      // 访问物料的地址
      return url;
    } catch (err) {
      spinner.fail('物料上传失败！');
      throw err;
    }
  }

}

async function requestFusion(options: AxiosRequestConfig, fusionHost: string) {
  try {
    const response = await axios(options);
    return response;
  } catch (err) {
    if (err.response && (err.response.status === 403 || err.response.status === 401)) {
      err.noAuth = true;
      console.log();
      console.log();
      console.log(`鉴权失败，请前往 ${fusionHost} 重新获取 token 或 请站点所有者把你添加为站点成员，完成后重新执行命令。`);
      console.log(`token 文档: ${chalk.yellow(`${fusionHost}/help.html#/dev-create-site`)}`);
      console.log(`添加成员文档: ${chalk.yellow(`${fusionHost}/help.html#/site-user-management`)}`);
      if (err.response.data.success === false) {
        console.log(`错误信息: ${chalk.red(err.response.data.message)}`);
      }
      console.log();
      console.log();
    }

    throw err;
  }
}
