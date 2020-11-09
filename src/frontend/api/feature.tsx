import { Config } from "@bentley/bentleyjs-core";
import {
  FeatureSymbology,
  IModelApp,
  IModelConnection,
  SceneContext,
  SnapshotConnection,
  SpatialModelState,
  TiledGraphicsProvider,
  TileTreeReference,
  Viewport,
} from "@bentley/imodeljs-frontend";
import { CommandItemDef, ItemList } from "@bentley/ui-framework";

export class TestFeature {
  public static createCommand(
    id: string,
    des: string,
    func: (args?: any) => any
  ): CommandItemDef {
    const testV1Def = new CommandItemDef({
      commandId: id,
      execute: func,
      iconSpec: "icon-developer",
      label: des,
      description: des,
      tooltip: des,
    });
    return testV1Def;
  }
  public static itemLists = new ItemList([
    TestFeature.createCommand(
      "addFeatureSymbology",
      "测试AddFeatureSymbology",
      addFeatureSymbology
    ),
    TestFeature.createCommand(
      "removeFeatureSymbology",
      "测试RemoveFeatureSymbology",
      removeFeatureSymbology
    ),
  ]);
}

async function addFeatureSymbology() {
  const vp = IModelApp.viewManager.selectedView;
  if (vp) {
    await addProvider(vp);
  }
}
async function removeFeatureSymbology() {
  const vp = IModelApp.viewManager.selectedView;
  if (vp) {
    await removeProvider(vp);
  }
}
/** 对TileTree的引用源自与用户打开的对象不同的IModelConnection */
class ExternalTreeRef extends TileTreeReference {
  private readonly _ref: TileTreeReference;
  private readonly _ovrs: FeatureSymbology.Overrides;

  public constructor(ref: TileTreeReference, ovrs: FeatureSymbology.Overrides) {
    super();
    this._ref = ref;
    this._ovrs = ovrs;
  }

  public get castsShadows() {
    return this._ref.castsShadows;
  }

  public get treeOwner() {
    return this._ref.treeOwner;
  }

  public addToScene(context: SceneContext): void {
    const tree = this.treeOwner.load();
    if (undefined === tree) return;

    // ###TODO transform
    const args = this.createDrawArgs(context);
    if (undefined === args) return;

    tree.draw(args);

    args.graphics.symbologyOverrides = this._ovrs;
    const branch = context.createBranch(args.graphics, args.location);
    context.outputGraphic(branch);
  }
}

class Provider implements TiledGraphicsProvider {
  private readonly _refs: TileTreeReference[] = [];
  public readonly iModel: IModelConnection;

  private constructor(
    vp: Viewport,
    iModel: IModelConnection,
    ovrs: FeatureSymbology.Overrides
  ) {
    this.iModel = iModel;
    for (const kvp of iModel.models.loaded) {
      const spatial = kvp[1].asSpatialModel;
      if (undefined !== spatial) {
        const ref = spatial.createTileTreeReference(vp.view);
        this._refs.push(new ExternalTreeRef(ref, ovrs));
      }
    }
  }

  public static async create(
    vp: Viewport,
    iModel: IModelConnection
  ): Promise<Provider> {
    const query = { from: SpatialModelState.classFullName, wantPrivate: false };
    const props = await iModel.models.queryProps(query);

    const modelIds = [];
    for (const prop of props) if (undefined !== prop.id) modelIds.push(prop.id);

    await iModel.models.load(modelIds);

    // Enable all categories (and subcategories thereof)
    const ecsql =
      "SELECT DISTINCT Category.Id as CategoryId from BisCore.GeometricElement3d WHERE Category.Id IN (SELECT ECInstanceId from BisCore.SpatialCategory)";
    const catIds: string[] = [];
    for await (const catId of iModel.query(ecsql))
      catIds.push(catId.categoryId);

    const subcatsRequest = iModel.subcategories.load(catIds);
    if (undefined !== subcatsRequest) await subcatsRequest.promise;

    // Ignore the symbology overrides defined on the viewport - instead, set up our own to draw our iModel's categories.
    const ovrs = new FeatureSymbology.Overrides();
    for (const catId of catIds) {
      const subcats = iModel.subcategories.getSubCategories(catId);
      if (undefined !== subcats)
        for (const subcat of subcats) ovrs.setVisibleSubCategory(subcat);
    }

    return new Provider(vp, iModel, ovrs);
  }

  public forEachTileTreeRef(
    _vp: Viewport,
    func: (ref: TileTreeReference) => void
  ): void {
    for (const ref of this._refs) func(ref);
  }
}
const providersByViewport = new Map<Viewport, Provider>();

/** A simple proof-of-concept for drawing tiles from a different IModelConnection into a Viewport. */
export async function addProvider(vp: Viewport): Promise<void> {
  const existing = providersByViewport.get(vp);
  if (undefined !== existing) {
    vp.dropTiledGraphicsProvider(existing);
    providersByViewport.delete(vp);
    await existing.iModel.close();
    return;
  }
  const filename = Config.App.getString("imjs_offline_imodel_Next");
  if (undefined === filename) return;
  let iModel;
  try {
    iModel = await SnapshotConnection.openFile(filename);
    const provider = await Provider.create(vp, iModel);
    providersByViewport.set(vp, provider);
    vp.addTiledGraphicsProvider(provider);
  } catch (err) {
    alert(err.toString());
  }
}
export async function removeProvider(vp: Viewport): Promise<void> {
  const existing = providersByViewport.get(vp);
  if (undefined !== existing) {
    vp.dropTiledGraphicsProvider(existing);
    providersByViewport.delete(vp);
    await existing.iModel.close();
  } else {
    alert("Provider不存在.");
  }
}
