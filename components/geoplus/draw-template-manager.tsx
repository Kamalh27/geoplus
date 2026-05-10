import { useState } from "react";
import { List, Lock, Unlock, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { DrawTemplate, DrawTemplateField } from "./use-geoplus-map";
import { CONTROL_GROUP_BUTTON_CLASS } from "./control-button-styles";

type DrawTemplateManagerProps = {
  activeDrawTemplate: DrawTemplate | null;
  setActiveDrawTemplate: (template: DrawTemplate | null) => void;
};

export function DrawTemplateManager({ activeDrawTemplate, setActiveDrawTemplate }: DrawTemplateManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<DrawTemplate>(activeDrawTemplate ?? {});
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<DrawTemplateField["type"]>("string");

  const isLocked = activeDrawTemplate !== null;

  const handleToggleLock = () => {
    if (isLocked) {
      setActiveDrawTemplate(null);
    } else {
      setActiveDrawTemplate(templateDraft);
    }
  };

  const handleAddKey = () => {
    const key = newKey.trim();
    if (!key || Object.prototype.hasOwnProperty.call(templateDraft, key)) return;
    
    const newField: DrawTemplateField = { value: "", type: newType };
    setTemplateDraft((prev) => ({ ...prev, [key]: newField }));
    setNewKey("");
    setNewType("string");
    
    if (isLocked) {
      setActiveDrawTemplate({ ...templateDraft, [key]: newField });
    }
  };

  const handleRemoveKey = (keyToRemove: string) => {
    const nextDraft = { ...templateDraft };
    delete nextDraft[keyToRemove];
    setTemplateDraft(nextDraft);
    
    if (isLocked) {
      setActiveDrawTemplate(nextDraft);
    }
  };

  const handleUpdateValue = (key: string, value: string) => {
    const nextDraft = { 
      ...templateDraft, 
      [key]: { ...templateDraft[key], value } 
    };
    setTemplateDraft(nextDraft);
    if (isLocked) {
      setActiveDrawTemplate(nextDraft);
    }
  };

  const handleUpdateType = (key: string, type: DrawTemplateField["type"]) => {
    const nextDraft = { 
      ...templateDraft, 
      [key]: { ...templateDraft[key], type } 
    };
    setTemplateDraft(nextDraft);
    if (isLocked) {
      setActiveDrawTemplate(nextDraft);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Attribute Template"
          className={`${CONTROL_GROUP_BUTTON_CLASS} ${isLocked ? "bg-accent/20 text-accent" : ""}`}
        >
          <List className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" sideOffset={12} className="w-[380px] p-0 shadow-lg border-border bg-background/95 backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-3 bg-muted/20">
          <div className="flex flex-col">
            <span className="text-sm font-semibold flex items-center gap-2">
              Attribute Template
            </span>
            <span className="text-xs text-muted-foreground mt-0.5">
              Define fields for newly drawn features.
            </span>
          </div>
          <Button 
            variant={isLocked ? "default" : "outline"}
            size="sm" 
            className="h-8 px-2.5 ml-2 shrink-0 transition-colors"
            onClick={handleToggleLock}
          >
            {isLocked ? <Lock className="size-3.5 mr-1.5" /> : <Unlock className="size-3.5 mr-1.5" />}
            {isLocked ? "Locked" : "Lock Schema"}
          </Button>
        </div>

        <div className="p-4 space-y-4 max-h-[300px] overflow-y-auto">
          {Object.entries(templateDraft).length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground bg-muted/10 rounded-md border border-dashed border-border/50">
              No template fields defined.<br/> Add a field below to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(templateDraft).map(([key, field]) => (
                <div key={key} className="flex items-center gap-2 group">
                  <div className="w-[100px] shrink-0 text-xs font-medium truncate text-foreground/80 bg-muted/30 px-2 py-1.5 rounded-md border border-border/40" title={key}>
                    {key}
                  </div>
                  <select
                    value={field.type}
                    onChange={(e) => handleUpdateType(key, e.target.value as DrawTemplateField["type"])}
                    className="h-8 w-24 shrink-0 rounded-md border border-input bg-background px-2 text-xs focus:border-accent focus:ring-1 focus:ring-accent outline-none"
                  >
                    <option value="string">String</option>
                    <option value="float">Float</option>
                    <option value="integer">Integer</option>
                    <option value="boolean">Boolean</option>
                  </select>
                  <Input 
                    value={field.value}
                    onChange={(e) => handleUpdateValue(key, e.target.value)}
                    placeholder={field.type === "boolean" ? "true/false" : "Default"} 
                    className="h-8 text-xs bg-background flex-1"
                  />
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground opacity-0 group-hover:opacity-100 transition-all"
                    onClick={() => handleRemoveKey(key)}
                    title="Remove field"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 border-t border-border/50 bg-muted/10">
          <form 
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleAddKey();
            }}
          >
            <Input 
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="New field name (e.g. Type)" 
              className="h-8 text-xs flex-1"
            />
            <select
              value={newType}
              onChange={(e) => setNewType(e.target.value as DrawTemplateField["type"])}
              className="h-8 w-28 shrink-0 rounded-md border border-input bg-background px-2 text-xs focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            >
              <option value="string">String</option>
              <option value="float">Float</option>
              <option value="integer">Integer</option>
              <option value="boolean">Boolean</option>
            </select>
            <Button type="submit" size="sm" className="h-8 shrink-0" disabled={!newKey.trim()}>
              <Plus className="size-3.5 mr-1" /> Add
            </Button>
          </form>
        </div>
      </PopoverContent>
    </Popover>
  );
}
