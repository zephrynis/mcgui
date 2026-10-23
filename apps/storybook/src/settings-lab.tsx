import { useState } from 'react';
import { Button, Checkbox, Slider, Tooltip, MinecraftText } from '@mcgui/react';

export function SettingsLab() {
  const [subtitles, setSubtitles] = useState(false), [music, setMusic] = useState(50), [brightness, setBrightness] = useState(75);
  const [message, setMessage] = useState('Change a setting, then apply.');
  return <section className="settings-lab" aria-label="Settings workbench">
    <h2>Settings</h2>
    <div className="settings-viewport">
      <form className="settings-menu" onSubmit={event => { event.preventDefault(); setMessage(`Applied: music ${music}%, brightness ${brightness}%, subtitles ${subtitles ? 'on' : 'off'}.`); }}
        onReset={() => { setSubtitles(false); setMusic(50); setBrightness(75); setMessage('Default settings restored.'); }}>
        <MinecraftText>Options</MinecraftText>
        <Tooltip content="Show subtitles for nearby sounds."><Checkbox name="subtitles" checked={subtitles} onCheckedChange={setSubtitles}>Show Subtitles</Checkbox></Tooltip>
        <Slider label="Music" name="music" value={music} onValueChange={setMusic} valueLabel={`Music: ${music}%`} />
        <Slider label="Brightness" name="brightness" step={5} value={brightness} onValueChange={setBrightness} valueLabel={`Brightness: ${brightness}%`} />
        <Checkbox checked disabled>Locked setting</Checkbox>
        <Slider label="Locked volume" value={25} disabled />
        <Button width={150} type="submit">Apply Settings</Button>
        <Button width={150} type="reset">Reset Settings</Button>
      </form>
    </div>
    <output className="settings-output slot-output" aria-live="polite">{message}</output>
  </section>;
}
