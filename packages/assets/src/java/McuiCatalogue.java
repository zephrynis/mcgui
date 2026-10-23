import com.google.gson.*;
import com.mojang.serialization.JsonOps;
import net.minecraft.SharedConstants;
import net.minecraft.server.Bootstrap;
import net.minecraft.data.registries.VanillaRegistries;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.item.*;
import net.minecraft.world.flag.FeatureFlags;
import java.nio.file.*;
import java.util.*;
import java.util.jar.*;
import net.minecraft.core.*;
import net.minecraft.resources.*;
import net.minecraft.tags.*;

/** MCUI-owned adapter for the locally installed, named Java 26.2 client classes.
 * Bootstrap creates registries, not a client window. Datagen lookups leave tags
 * unbound, so this adapter binds the JAR's vanilla tags before building tabs.
 * Package-private tag APIs below are deliberately pinned to this game version.
 */
public class McuiCatalogue {
  // Geometry is exported from the user's client, never copied into npm packages.
  static JsonObject specialGeometry() {
    var result = new JsonObject();
    var wanted = Set.of("chest#main", "shulker_box#main", "standing_banner#main", "standing_banner#flag", "conduit#shell", "shield#main",
      "decorated_pot_base#main", "decorated_pot_sides#main", "skeleton_skull#main", "wither_skeleton_skull#main", "player_head#main",
      "zombie_head#main", "creeper_head#main", "piglin_head#main", "dragon_skull#main", "copper_golem#main", "copper_golem_sitting#main", "copper_golem_running#main", "copper_golem_star#main");
    var roots = net.minecraft.client.model.geom.LayerDefinitions.createRoots();
    roots.entrySet().stream().sorted(Comparator.comparing(entry -> entry.getKey().toString())).forEach(entry -> {
      String key = entry.getKey().toString().replace("minecraft:", "");
      if (!wanted.contains(key)) return;
      var part = entry.getValue().bakeRoot();
      var quads = new JsonArray();
      part.visit(new com.mojang.blaze3d.vertex.PoseStack(), (pose, name, index, cube) -> {
        for (var polygon : cube.polygons) {
          var quad = new JsonObject(); quad.addProperty("part", name);
          var vertices = new JsonArray();
          for (var vertex : polygon.vertices()) {
            var point = pose.pose().transformPosition(new org.joml.Vector3f(vertex.worldX(), vertex.worldY(), vertex.worldZ()));
            var value = new JsonArray(); value.add(point.x * 16); value.add(point.y * 16); value.add(point.z * 16); value.add(vertex.u() * 16); value.add(vertex.v() * 16); vertices.add(value);
          }
          quad.add("vertices", vertices); quads.add(quad);
        }
      });
      result.add(key, quads);
    });
    return result;
  }
  static Set<String> resolve(String id, Map<String, JsonObject> definitions, Set<String> visiting) {
    if (!visiting.add(id)) throw new IllegalStateException("Tag cycle: " + id);
    var result = new LinkedHashSet<String>(); var definition = definitions.get(id);
    if (definition != null) for (var entry : definition.getAsJsonArray("values")) {
      String value = entry.isJsonPrimitive() ? entry.getAsString() : entry.getAsJsonObject().get("id").getAsString();
      if (value.startsWith("#")) result.addAll(resolve(value.substring(1), definitions, visiting)); else result.add(value);
    }
    visiting.remove(id); return result;
  }
  @SuppressWarnings({"rawtypes", "unchecked"})
  static HolderLookup.Provider bindTags(HolderLookup.Provider lookup, String clientJar) throws Exception {
    var bind = Holder.Reference.class.getDeclaredMethod("bindTags", Collection.class); bind.setAccessible(true);
    var registries = new ArrayList<HolderLookup.RegistryLookup<?>>();
    try (var jar = new JarFile(clientJar)) {
      for (var registry : lookup.listRegistries().toList()) {
        var definitions = new LinkedHashMap<String, JsonObject>();
        String prefix = "data/minecraft/tags/" + registry.key().identifier().getPath() + "/";
        for (var entry : jar.stream().filter(e -> e.getName().startsWith(prefix) && e.getName().endsWith(".json")).toList()) {
          try (var stream = jar.getInputStream(entry)) { definitions.put("minecraft:" + entry.getName().substring(prefix.length(),entry.getName().length()-5),JsonParser.parseString(new String(stream.readAllBytes(),java.nio.charset.StandardCharsets.UTF_8)).getAsJsonObject()); }
        }
        registries.add(tagged(registry, definitions));
        var memberships = new HashMap<String, List<TagKey>>();
        for (String tag : definitions.keySet()) for (String item : resolve(tag, definitions, new HashSet<>())) memberships.computeIfAbsent(item,k -> new ArrayList<>()).add(TagKey.create((ResourceKey)registry.key(),Identifier.parse(tag)));
        for (var holder : registry.listElements().toList()) bind.invoke(holder, memberships.getOrDefault(holder.key().identifier().toString(),List.of()));
      }
    }
    return HolderLookup.Provider.create(registries.stream());
  }
  @SuppressWarnings({"rawtypes", "unchecked"})
  static <T> HolderLookup.RegistryLookup<T> tagged(HolderLookup.RegistryLookup<T> registry, Map<String,JsonObject> definitions) throws Exception {
    var constructor = HolderSet.Named.class.getDeclaredConstructor(HolderOwner.class,TagKey.class); constructor.setAccessible(true);
    var bind = HolderSet.Named.class.getDeclaredMethod("bind",List.class); bind.setAccessible(true);
    var tags = new LinkedHashMap<TagKey<T>,HolderSet.Named<T>>();
    for (String name : definitions.keySet()) {
      TagKey<T> key = TagKey.create((ResourceKey)registry.key(),Identifier.parse(name));
      HolderSet.Named<T> set = (HolderSet.Named<T>)constructor.newInstance(registry,key);
      var members = resolve(name,definitions,new HashSet<>());
      var byId = new HashMap<String,Holder<T>>(); registry.listElements().forEach(holder -> byId.put(holder.key().identifier().toString(),holder));
      bind.invoke(set,members.stream().map(byId::get).filter(Objects::nonNull).toList()); tags.put(key,set);
    }
    return new HolderLookup.RegistryLookup.Delegate<T>() {
      public HolderLookup.RegistryLookup<T> parent() { return registry; }
      public java.util.stream.Stream<Holder.Reference<T>> listElements() { return registry.listElements().sorted(Comparator.comparing(holder -> holder.key().identifier().toString())); }
      public Optional<HolderSet.Named<T>> get(TagKey<T> key) { return Optional.ofNullable(tags.get(key)); }
      public java.util.stream.Stream<HolderSet.Named<T>> listTags() { return tags.values().stream(); }
    };
  }
  public static void main(String[] args) throws Exception {
    SharedConstants.tryDetectVersion(); Bootstrap.bootStrap();
    var lookup = VanillaRegistries.createLookup();
    var ops = lookup.createSerializationContext(JsonOps.INSTANCE);
    lookup = bindTags(lookup, args[1]);
    for (var pending : BuiltInRegistries.DATA_COMPONENT_INITIALIZERS.build(lookup)) pending.apply();
    CreativeModeTabs.tryRebuildTabContents(FeatureFlags.DEFAULT_FLAGS, false, lookup);
    var root = new JsonObject(); root.addProperty("version", SharedConstants.getCurrentVersion().name());
    var tabs = new JsonArray();
    for (var tab : CreativeModeTabs.allTabs()) {
      var out = new JsonObject(); out.addProperty("id", BuiltInRegistries.CREATIVE_MODE_TAB.getKey(tab).toString()); out.addProperty("label",tab.getDisplayName().getString());
      out.addProperty("kind",tab.getType().name()); out.addProperty("row",tab.row().name()); out.addProperty("column",tab.column());
      var items = new JsonArray();
      for (var stack : tab.getDisplayItems()) {
        var item = new JsonObject(); item.addProperty("id",BuiltInRegistries.ITEM.getKey(stack.getItem()).toString());
        item.addProperty("label", stack.getHoverName().getString()); item.addProperty("maxStackSize",stack.getMaxStackSize());
        item.addProperty("translationKey", stack.getItem().getDescriptionId());
        var tags = new JsonArray(); stack.typeHolder().tags().map(tag -> tag.location().toString()).sorted().forEach(tags::add); item.add("tags", tags);
        var tooltip = new JsonArray(); var styledTooltip = new JsonArray();
        for (var line : stack.getTooltipLines(Item.TooltipContext.of(lookup), null, TooltipFlag.NORMAL)) {
          tooltip.add(line.getString()); var runs = new JsonArray();
          line.visit((style, text) -> {
            var run = new JsonObject(); run.addProperty("text", text);
            if (style.getColor() != null) run.addProperty("color", String.format("#%06x",style.getColor().getValue()));
            if (style.isBold()) run.addProperty("bold",true);
            if (style.isItalic()) run.addProperty("italic",true);
            if (style.isUnderlined()) run.addProperty("underlined",true);
            if (style.isStrikethrough()) run.addProperty("strikethrough",true);
            runs.add(run); return Optional.empty();
          }, net.minecraft.network.chat.Style.EMPTY);
          styledTooltip.add(runs);
        }
        item.add("tooltip", tooltip); item.add("styledTooltip",styledTooltip);
        item.addProperty("damage",stack.getDamageValue()); item.addProperty("maxDamage",stack.getMaxDamage()); item.addProperty("glint",stack.hasFoil());
        var colors = new JsonObject();
        var potion = stack.get(net.minecraft.core.component.DataComponents.POTION_CONTENTS); if (potion != null) colors.addProperty("potion", potion.getColor());
        var dye = stack.get(net.minecraft.core.component.DataComponents.DYED_COLOR); if (dye != null) colors.addProperty("dyed", dye.rgb()); item.add("colors", colors);
        item.add("stack", ItemStack.CODEC.encodeStart(ops, stack).getOrThrow());
        items.add(item);
      }
      out.add("items",items); tabs.add(out);
    }
    root.add("tabs",tabs); root.add("specialGeometry",specialGeometry());
    var dyeColors = new JsonObject(); for (var color : DyeColor.values()) dyeColors.addProperty(color.getName(),color.getTextureDiffuseColor()); root.add("dyeColors",dyeColors);
    Files.writeString(Path.of(args[0]),new Gson().toJson(root));
  }
}
