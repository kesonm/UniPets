"""Individual eyelids, eyebrows and muzzle smile with animator sliders."""
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from core import *
SLIDERS={'blink_L':'Blink.L','blink_R':'Blink.R','brow_L':'BrowLift.L','brow_R':'BrowLift.R','smile':'CheekSmile'}
def install(rig):
    mesh=bpy.data.objects['Coat.Head'];keys=mesh.data.shape_keys
    for prop,name in SLIDERS.items():
        if prop not in rig:rig[prop]=0.
        rig.id_properties_ui(prop).update(min=0,max=1,soft_min=0,soft_max=1,description=name)
        shape=keys.key_blocks[name];shape.driver_remove('value')
        driver=shape.driver_add('value').driver;driver.type='AVERAGE';var=driver.variables.new();var.name='control';var.type='SINGLE_PROP'
        var.targets[0].id=rig;var.targets[0].data_path='["%s"]'%prop
    rig['expression_controls']='blink_L/R · brow_L/R · smile · Eye.L/R · Ear.L/R · Jaw · Tongue'
if __name__=='__main__':
    load('cat_rigged.blend');install(bpy.data.objects['Mugi | feline rig']);save(BLENDS/'cat_rigged.blend')
