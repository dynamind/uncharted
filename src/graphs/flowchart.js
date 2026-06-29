import { register } from "./registry.js";

// A small DAG that reads like a real flowchart. Shines with the layered solver +
// orthogonal routing + arrows, so it declares those as its preferred UI defaults.
register({
  id: "flowchart",
  label: "Flowchart (DAG)",
  prefer: { solver: "layered", routing: "orthogonal", arrows: true },
  build() {
    const defs = [
      ["Start","rect"], ["Receive\nrequest","rect"], ["Authorised?","diamond"],
      ["Reject","rect"], ["Parse body","rect"], ["Valid?","diamond"],
      ["Process","rect"], ["Error","rect"], ["Respond","rect"], ["End","rect"],
    ];
    const nodes = defs.map((d, i) => ({
      id: i, label: d[0], shape: d[1],
      w: d[1] === "diamond" ? 104 : 98, h: d[1] === "diamond" ? 56 : 40,
    }));
    const E = (s, t) => ({ source: s, target: t });
    const edges = [
      E(0,1), E(1,2), E(2,4), E(2,3),     // start → receive → auth? → (yes parse / no reject)
      E(4,5), E(5,6), E(5,7),             // parse → valid? → (yes process / no error)
      E(6,8), E(3,8), E(7,8), E(8,9),     // process/reject/error → respond → end
    ];
    return { nodes, edges };
  },
});
