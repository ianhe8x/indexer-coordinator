// Copyright 2020-2022 SubQuery Pte Ltd authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { INestApplication } from '@nestjs/common';
import { GraphqlQueryClient, NETWORK_CONFIGS, NetworkConfig } from '@subql/network-clients';
import { GetStateChannels, GetStateChannelsQuery } from '@subql/network-query';

import { BigNumber } from 'ethers';
import { ContractService } from './core/contract.service';
import { PaygService } from './payg/payg.service';
import { getLogger, LogCategory } from './utils/logger';
import { argv } from './yargs';

export function sync(app: INestApplication) {
  const config = NETWORK_CONFIGS[argv['network']] as NetworkConfig;
  const client = new GraphqlQueryClient(config);
  const apolloClient = client.networkClient;

  // FIXME
  /* eslint-disable */

  setInterval(async () => {
    try {
      getLogger(LogCategory.coordinator).debug(`load from Subquery Project...`);
      const result = await apolloClient.query<GetStateChannelsQuery>({
        query: GetStateChannels,
        variables: { status: 'OPEN' },
      });

      await Promise.all(
        result.data.stateChannels.nodes.map((stateChannel) =>
          paygServicee.syncChannel(
            BigNumber.from(stateChannel.id).toString(),
            stateChannel.deployment.id,
            stateChannel.indexer,
            stateChannel.consumer,
            stateChannel.total.toString(),
            stateChannel.spent.toString(),
            stateChannel.price.toString(),
            new Date(stateChannel.expiredAt).valueOf() / 1000,
            new Date(stateChannel.terminatedAt).valueOf() / 1000,
            stateChannel.terminateByIndexer,
            stateChannel.isFinal,
          ),
        ),
      );
    } catch (e) {
      getLogger(LogCategory.coordinator).error(e);
    }
  }, 10000);

  getLogger(LogCategory.coordinator).info(`start listening events from chain ...`);

  const contractService: ContractService = app.get<ContractService>(ContractService);
  const paygServicee: PaygService = app.get<PaygService>(PaygService);
  const sdk = contractService.getSdk();
  const contract = sdk.stateChannel;

  contract.on(
    'ChannelOpen',
    async (channelId, indexer, consumer, total, price, expiredAt, deploymentId, callback) => {
      await paygServicee.syncOpen(
        channelId.toString(),
        indexer,
        consumer,
        total.toString(),
        price.toString(),
        expiredAt.toNumber(),
        deploymentId,
      );
    },
  );
  contract.on('ChannelExtend', async (channelId, expiredAt) => {
    await paygServicee.syncExtend(channelId.toString(), expiredAt.toNumber());
  });
  contract.on('ChannelFund', async (channelId, total) => {
    await paygServicee.syncFund(channelId.toString(), total.toString());
  });
  contract.on('ChannelCheckpoint', async (channelId, spent) => {
    await paygServicee.syncCheckpoint(channelId.toString(), spent.toString());
  });
  contract.on('ChannelTerminate', async (channelId, spent, terminatedAt, terminateByIndexer) => {
    await paygServicee.syncTerminate(
      channelId.toString(),
      spent.toString(),
      terminatedAt.toNumber(),
      terminateByIndexer,
    );
  });
  contract.on('ChannelFinalize', async (channelId, total, remain) => {
    await paygServicee.syncFinalize(channelId.toString(), total.toNumber(), remain.toNumber());
  });
  contract.on('ChannelLabor', async (deploymentId, indexer, amount) => {
    const chain_last_block = await contractService.getLastBlockNumber();
    await paygServicee.syncLabor(deploymentId, indexer, amount.toString(), chain_last_block);
  });
  /* eslint-enable */
}
