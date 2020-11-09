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
      "testFeatureSymbology",
      "测试FeatureSymbology",
      testFeatureSymbology
    ),
  ]);
}

async function testFeatureSymbology() {
  alert("测试feature");
}
