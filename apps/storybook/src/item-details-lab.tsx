import { useMemo, useState } from 'react';
import { Button, ItemIcon, Slot, itemTooltip, useMinecraft, type InventoryItem, type TextContent, type useInventory } from '@mcgui/react';

export function ItemDetailsLab({ inventory }: { inventory: ReturnType<typeof useInventory<InventoryItem>> }) {
  const {assets} = useMinecraft();
  const tools = useMemo(()=>assets.catalogue?.items.filter(item=>(item.maxDamage ?? 0)>0) ?? [],[assets.catalogue]);
  const [key,setKey] = useState('minecraft:diamond_sword'), [damagePercent,setDamage] = useState(45);
  const [enchanted,setEnchanted] = useState(true), [name,setName] = useState(''), [lore,setLore] = useState('A trusty companion.'), [enchantment,setEnchantment] = useState('Unbreaking III');
  const item = tools.find(item=>item.stackKey===key) ?? tools[0];
  const damage = item ? Math.round(damagePercent/100*item.maxDamage!) : 0;
  const preview = useMemo(():InventoryItem|null=>{
    if(!item) return null;
    const native = item.styledTooltip ?? item.tooltip.map(text=>[{text}]);
    const separator = native.findIndex((line,index)=>index>0 && line.every(run=>!run.text));
    const attributes: TextContent[] = separator<0 ? [] : native.slice(separator+1);
    const title: TextContent = [{text:name || item.label,color:enchanted?'aqua':'white',italic:!!name}];
    return {stackKey:`${item.stackKey}|details:${JSON.stringify([damage,enchanted,name,enchantment,lore])}`,label:name || item.label,count:1,maxStackSize:1,
      content:<ItemIcon stackKey={item.stackKey} damage={damage} glint={enchanted}/>,
      tooltip:itemTooltip(item,{name:title,enchantments:enchanted && enchantment ? [enchantment] : [],lore:lore ? lore.split('\n') : [],attributes}),
    };
  },[item,damage,enchanted,name,enchantment,lore]);
  if(!item || !preview) return <section className="item-details-lab"><p>Re-extract with the current --items tool to try damage and enchantments.</p></section>;
  return <section className="item-details-lab" aria-label="Item details workbench">
    <h2>Item details</h2>
    <div className="item-details-controls">
      <label>Item <select aria-label="Preview item" value={item.stackKey} onChange={event=>setKey(event.target.value)}>{tools.map(item=><option key={item.stackKey} value={item.stackKey}>{item.label}</option>)}</select></label>
      <label>Damage · {damage} / {item.maxDamage}<input aria-label="Item damage" type="range" min="0" max="100" value={damagePercent} onChange={event=>setDamage(Number(event.target.value))}/></label>
      <label className="item-details-check"><input type="checkbox" checked={enchanted} onChange={event=>setEnchanted(event.target.checked)}/> Enchanted</label>
      <label>Enchantment <input value={enchantment} onChange={event=>setEnchantment(event.target.value)} maxLength={80}/></label>
      <label>Custom name <input value={name} onChange={event=>setName(event.target.value)} placeholder={item.label} maxLength={80}/></label>
      <label>Lore <textarea aria-label="Lore" value={lore} onChange={event=>setLore(event.target.value)} rows={2} maxLength={400}/></label>
    </div>
    <div className="item-details-preview">
      <Slot label="Item detail preview" tooltip={preview.tooltip}>{preview.content}</Slot>
      <Button width={130} onClick={()=>inventory.replaceSlots([81],[preview])}>Put in hotbar</Button>
      <span>{item.maxDamage!-damage} durability remaining</span>
    </div>
    <p className="inventory-note">Hover or focus the item to see its tooltip. Put it in the first hotbar slot to try moving it between inventories.</p>
  </section>;
}
