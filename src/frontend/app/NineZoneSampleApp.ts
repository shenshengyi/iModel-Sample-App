/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Config } from "@bentley/bentleyjs-core";
import { BentleyCloudRpcParams } from "@bentley/imodeljs-common";
import { FrontendRequestContext, IModelApp, IModelAppOptions } from "@bentley/imodeljs-frontend";
import { UrlDiscoveryClient } from "@bentley/itwin-client";
import { Presentation } from "@bentley/presentation-frontend";
import { AppNotificationManager, UiFramework } from "@bentley/ui-framework";
import { initRpc } from "../api/rpc";
import { AppState, AppStore } from "./AppState";

/**
 * List of possible backends that ninezone-sample-app can use
 */
export enum UseBackend {
  /** Use local ninezone-sample-app backend */
  Local = 0,

  /** Use deployed general-purpose backend */
  GeneralPurpose = 1,
}

// subclass of IModelApp needed to use imodeljs-frontend
export class NineZoneSampleApp {
  private static _appState: AppState;

  // public static get oidcClient(): FrontendAuthorizationClient { return IModelApp.authorizationClient as FrontendAuthorizationClient; }

  public static get store(): AppStore { return this._appState.store; }

  public static async startup(): Promise<void> {

    // Use the AppNotificationManager subclass from ui-framework to get prompts and messages
    const opts: IModelAppOptions = {};
    opts.notifications = new AppNotificationManager();
    opts.applicationVersion = "1.0.0";

    await IModelApp.startup(opts);

    // contains various initialization promises which need
    // to be fulfilled before the app is ready
    const initPromises = new Array<Promise<any>>();

    // initialize RPC communication
    initPromises.push(NineZoneSampleApp.initializeRpc());

    // initialize localization for the app
    initPromises.push(IModelApp.i18n.registerNamespace("NineZoneSample").readFinished);

    // create the application state store for Redux
    this._appState = new AppState();

    // initialize UiFramework
    initPromises.push(UiFramework.initialize(this.store, IModelApp.i18n));

    // initialize Presentation
    initPromises.push(Presentation.initialize({
      activeLocale: IModelApp.i18n.languageList()[0],
    }));

    // the app is ready when all initialization promises are fulfilled
    await Promise.all(initPromises);
  }

  private static async initializeRpc(): Promise<void> {
    const rpcParams = await this.getConnectionInfo();
    initRpc(rpcParams);
  }

  private static async getConnectionInfo(): Promise<BentleyCloudRpcParams | undefined> {
    const usedBackend = Config.App.getNumber("imjs_backend", UseBackend.Local);

    if (usedBackend === UseBackend.GeneralPurpose) {
      const urlClient = new UrlDiscoveryClient();
      const requestContext = new FrontendRequestContext();
      const orchestratorUrl = await urlClient.discoverUrl(requestContext, "iModelJsOrchestrator.K8S", undefined);
      return { info: { title: "general-purpose-imodeljs-backend", version: "v2.0" }, uriPrefix: orchestratorUrl };
    }

    if (usedBackend === UseBackend.Local)
      return undefined;

    throw new Error(`Invalid backend "${usedBackend}" specified in configuration`);
  }
}
