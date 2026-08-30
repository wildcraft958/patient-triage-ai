import {
  BarChart3, Boxes, ClipboardList, Eye, Settings2, Workflow,
} from 'lucide-react'

// The console's sections, in the order a shift moves through them: the board
// first, then who needs looking at, then how the recommendation was made.
export const VIEWS = [
  { id: 'queue', label: 'Patient queue', icon: ClipboardList },
  { id: 'monitor', label: 'Monitoring', icon: Eye },
  { id: 'pipeline', label: 'Pipeline', icon: Workflow },
  { id: 'registry', label: 'Registry', icon: Boxes },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'settings', label: 'Settings', icon: Settings2 },
]
