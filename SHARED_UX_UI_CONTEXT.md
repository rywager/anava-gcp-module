# Shared UX/UI Context Document

## Project Goal
Create a professional, streamlined workflow for the Anava Vision Infrastructure Deployment Tool with modern UX/UI design.

## Target Workflow
1. **Login**: Google OAuth authentication
2. **Project Selection**: Choose GCP project from user's available projects
3. **ACAP Deployment**: Deploy latest ACAP to Axis camera
4. **Anava Personal Cloud**: Deploy infrastructure via Terraform
5. **Camera Configuration**: Securely submit config to running camera
6. **Chat Interface**: Placeholder for Anava Vision MCP server client

## Current State
- Electron app with React frontend using Material-UI
- Basic functionality exists but needs professional polish
- Main UI component: `anava-desktop-app/src/renderer/src/components/AutoDashboard.tsx`

## Design Principles
- Professional, enterprise-ready appearance
- Clear workflow progression
- Minimal cognitive load
- Real-time feedback and progress indicators
- Error handling with actionable guidance

## Technical Constraints
- Must work within Electron/React framework
- Preserve existing IPC communication patterns
- Maintain compatibility with Terraform deployment process
- Support cross-platform (Windows, macOS, Linux)

## Branding
- "Anava Personal Cloud" as primary branding
- Professional color scheme aligned with enterprise software
- Clean, modern typography
- Consistent iconography

## Agent Collaboration Notes
- UX Designer: Focus on workflow, wireframes, and user journey
- UI Engineer: Implement designs while preserving functionality
- Both agents should update this document with findings and progress

---

# UX Analysis and Design Recommendations

## Current State Analysis

### Pain Points Identified
1. **Fragmented User Journey**: Current AutoDashboard uses tabs that don't clearly guide users through the sequential workflow
2. **Technical Complexity Exposed**: Raw JSON outputs, terminal commands, and technical jargon create cognitive overload
3. **Unclear Progress**: No visual workflow indicator showing where users are in the 6-step process
4. **Poor Onboarding**: Authentication screen shows terminal commands instead of user-friendly guidance
5. **Inconsistent Visual Hierarchy**: Mixed use of cards, alerts, and typography without clear priority
6. **No Clear CTAs**: Multiple buttons and actions compete for attention without primary/secondary distinction

### Strengths to Preserve
1. Real-time deployment logs provide transparency
2. Copy-to-clipboard functionality is well-implemented
3. Configuration display is comprehensive
4. Error handling exists (needs better UX)

## User Journey Map

### Persona: Enterprise IT Administrator
**Goal**: Deploy Anava Personal Cloud infrastructure for their organization's security cameras

### Journey Stages

#### 1. First Launch & Authentication (5-10 minutes)
- **User Actions**: Opens app for first time, needs to authenticate
- **Emotions**: Curious but cautious, wants to understand requirements
- **Pain Points**: Terminal commands in UI, unclear why both auth types needed
- **Opportunities**: Guided OAuth flow, explain benefits clearly

#### 2. Project Selection (2-3 minutes)
- **User Actions**: Reviews available GCP projects, selects appropriate one
- **Emotions**: Focused, evaluating options
- **Pain Points**: No guidance on project requirements or best practices
- **Opportunities**: Project validation, requirement checklist

#### 3. ACAP Deployment (10-15 minutes)
- **User Actions**: Discovers cameras, deploys ACAP application
- **Emotions**: Engaged, monitoring progress
- **Pain Points**: Camera discovery might fail, deployment errors unclear
- **Opportunities**: Automatic retry, clear troubleshooting

#### 4. Infrastructure Deployment (15-20 minutes)
- **User Actions**: Initiates Terraform deployment, monitors progress
- **Emotions**: Anxious about success, watching logs
- **Pain Points**: Long process with technical logs, unclear if errors are critical
- **Opportunities**: Progress milestones, plain language status

#### 5. Camera Configuration (5-10 minutes)
- **User Actions**: Reviews config, sends to cameras
- **Emotions**: Almost done, wants confirmation
- **Pain Points**: Manual IP entry, security concerns
- **Opportunities**: Camera list from discovery, secure by default

#### 6. Success & Next Steps (2-5 minutes)
- **User Actions**: Sees success confirmation, explores chat placeholder
- **Emotions**: Satisfied, curious about capabilities
- **Pain Points**: Unclear what to do next
- **Opportunities**: Success celebration, clear next steps

## Design System

### Color Palette
```
Primary Brand Colors:
- Primary Blue: #0052CC (Professional, trustworthy)
- Primary Dark: #003D99
- Primary Light: #4C9AFF

Secondary Colors:
- Success Green: #00875A
- Warning Amber: #FF991F
- Error Red: #DE350B
- Info Purple: #5243AA

Neutral Colors:
- Background: #F7F8FA
- Surface: #FFFFFF
- Border: #DFE1E6
- Text Primary: #172B4D
- Text Secondary: #6B778C
```

### Typography System
```
Font Family: Inter, -apple-system, BlinkMacSystemFont, sans-serif

Headings:
- H1: 32px, 600 weight (Page titles)
- H2: 24px, 600 weight (Section headers)
- H3: 20px, 500 weight (Card titles)
- H4: 16px, 500 weight (Subsections)

Body:
- Large: 16px, 400 weight (Primary content)
- Regular: 14px, 400 weight (Standard text)
- Small: 12px, 400 weight (Captions, labels)

Special:
- Button: 14px, 500 weight, 0.5px letter-spacing
- Code: 13px, 'SF Mono', monospace
```

### Component Patterns

#### Progress Indicator
- Horizontal stepper with 6 steps
- Current step highlighted with primary color
- Completed steps show success checkmark
- Future steps grayed out
- Each step shows estimated time

#### Cards
- White background with subtle shadow
- 16px padding, 8px border-radius
- Clear header with icon
- Structured content sections
- Action buttons bottom-aligned

#### Buttons
- Primary: Filled, primary color, for main CTAs
- Secondary: Outlined, for alternative actions
- Text: No border, for tertiary actions
- Consistent 36px height, 16px horizontal padding

#### Status Messages
- Banner style, full width within container
- Icon + message + optional action
- Persist until manually dismissed or state changes
- Smooth slide-in animation

## Wireframe Specifications

### 1. Welcome/Authentication Screen
```
+------------------------------------------+
|   Anava Personal Cloud                   |
|   Enterprise Camera Infrastructure       |
|                                          |
|        [Anava Logo]                      |
|                                          |
|   Set up your private cloud              |
|   infrastructure in minutes              |
|                                          |
|   [Sign in with Google]                  |
|                                          |
|   Requirements:                          |
|   ✓ Google Cloud account                 |
|   ✓ Project with billing                 |
|   ✓ 15-20 minutes for setup             |
|                                          |
|   [Learn More]                           |
+------------------------------------------+
```

### 2. Project Selection Screen
```
+------------------------------------------+
| ← Back     Select Your Project      Help |
|                                          |
| Progress: [==--------] Step 2 of 6       |
|                                          |
| Choose a Google Cloud project for your   |
| Anava Personal Cloud deployment          |
|                                          |
| [Dropdown: Select Project]               |
|                                          |
| Selected: my-company-prod                |
| • Project ID: my-company-prod-123        |
| • Billing: Active ✓                      |
| • APIs: 3 of 5 enabled                   |
|                                          |
| ⚠ Required APIs will be enabled:         |
|   • Cloud Functions API                  |
|   • Firebase API                         |
|                                          |
| [Previous]              [Continue →]     |
+------------------------------------------+
```

### 3. ACAP Deployment Screen
```
+------------------------------------------+
| ← Back   Deploy Camera Software     Help |
|                                          |
| Progress: [====------] Step 3 of 6       |
|                                          |
| Installing Anava software on cameras     |
|                                          |
| Discovered Cameras:                      |
| +------------------------------------+  |
| | ✓ Axis M3065-V    192.168.1.101   |  |
| |   Status: Ready                    |  |
| +------------------------------------+  |
| | ⟳ Axis P3245-LV   192.168.1.102   |  |
| |   Status: Deploying... 45%         |  |
| +------------------------------------+  |
| | ○ Axis M3067-P    192.168.1.103   |  |
| |   Status: Waiting                  |  |
| +------------------------------------+  |
|                                          |
| [Scan Again]    [Skip]    [Deploy All]   |
+------------------------------------------+
```

### 4. Infrastructure Deployment Screen
```
+------------------------------------------+
| ← Back    Building Your Cloud       Help |
|                                          |
| Progress: [======----] Step 4 of 6       |
|                                          |
| Creating your private infrastructure     |
|                                          |
| +------------------------------------+  |
| | Current Task:                      |  |
| | Setting up API Gateway             |  |
| |                                    |  |
| | [████████████░░░░░] 72%            |  |
| |                                    |  |
| | ✓ Project validation               |  |
| | ✓ Service accounts created         |  |
| | ✓ Firebase initialized             |  |
| | ⟳ API Gateway configuration        |  |
| | ○ Security rules                   |  |
| | ○ Final validation                 |  |
| |                                    |  |
| | Estimated time remaining: 3 min    |  |
| +------------------------------------+  |
|                                          |
| [View Logs]              [Pause]         |
+------------------------------------------+
```

### 5. Camera Configuration Screen
```
+------------------------------------------+
| ← Back    Configure Cameras         Help |
|                                          |
| Progress: [========--] Step 5 of 6       |
|                                          |
| Send secure configuration to cameras     |
|                                          |
| Configuration Summary:                   |
| • API Gateway: *.uc.gateway.dev ✓        |
| • Authentication: Active ✓               |
| • Encryption: Enabled ✓                  |
|                                          |
| Select cameras to configure:             |
| ☑ Axis M3065-V  - 192.168.1.101         |
| ☑ Axis P3245-LV - 192.168.1.102         |
| ☑ Axis M3067-P  - 192.168.1.103         |
|                                          |
| 🔒 Configuration will be encrypted       |
|                                          |
| [Select All]         [Send Securely →]   |
+------------------------------------------+
```

### 6. Success & Chat Screen
```
+------------------------------------------+
|        ✓ Setup Complete!            Help |
|                                          |
| Progress: [==========] Complete!         |
|                                          |
| Your Anava Personal Cloud is ready       |
|                                          |
| +------------------------------------+  |
| | Deployment Summary                 |  |
| | • 3 cameras connected              |  |
| | • Infrastructure active            |  |
| | • Security configured              |  |
| |                                    |  |
| | [Download Report]  [View Details]  |  |
| +------------------------------------+  |
|                                          |
| What's Next?                             |
| +------------------------------------+  |
| | Chat with your cameras             |  |
| | Coming soon: AI-powered insights   |  |
| |                                    |  |
| | [Open Camera List] [Explore Docs]  |  |
| +------------------------------------+  |
|                                          |
| [Return to Dashboard]                    |
+------------------------------------------+
```

## Error Handling Patterns

### Inline Validation
- Real-time feedback as users interact
- Clear error messages below fields
- Suggest corrections when possible

### Error Recovery
- Automatic retry with exponential backoff
- Clear manual retry options
- Save progress to allow resumption
- Rollback capabilities for critical failures

### Error Messaging
- Plain language explanations
- Actionable next steps
- Technical details in expandable section
- Support contact for unrecoverable errors

## Animation and Feedback

### Transitions
- 200ms ease-in-out for most transitions
- 300ms for page transitions
- Subtle slide effects for step progression

### Loading States
- Skeleton screens for content loading
- Progress bars for determinate operations
- Pulsing effects for indeterminate waits
- Estimated time remaining when possible

### Success Feedback
- Checkmark animation on completion
- Brief celebration for major milestones
- Subtle color transitions
- Auto-progression after 2 seconds

## Accessibility Considerations

- WCAG 2.1 AA compliance minimum
- Keyboard navigation for all interactions
- Screen reader announcements for status changes
- High contrast mode support
- Clear focus indicators
- Descriptive button and link text
- Alternative text for all icons

## Mobile Responsiveness

While primarily desktop-focused, ensure:
- Minimum 768px width support
- Readable text without horizontal scroll
- Touch-friendly button sizes (44px targets)
- Collapsible sections for smaller screens

## Implementation Priorities

### Phase 1: Core Flow (MVP)
1. Unified workflow with step progression
2. Improved authentication experience
3. Clear deployment status and progress
4. Simplified configuration display

### Phase 2: Polish
1. Animation and transitions
2. Enhanced error handling
3. Inline help and tooltips
4. Progress persistence

### Phase 3: Delight
1. Success celebrations
2. Advanced deployment options
3. Deployment history
4. Export/import configurations

## Technical Implementation Notes (From Current Code Analysis)

### Existing Components to Refactor
1. **AutoDashboard.tsx**: Currently uses tabs, needs conversion to step-based workflow
2. **DeploymentConfig.tsx**: Good functionality but needs UX simplification
3. **ChatInterface.tsx**: Well-structured placeholder, minimal changes needed
4. **CameraDiscovery.tsx**: Exists separately, needs integration into workflow

### IPC Channels to Preserve
- `terraform:progress`, `terraform:error`, `terraform:complete`
- `gcpAPI.*` for authentication and project management
- `terraformAPI.*` for deployment operations
- `store.*` for persistence

### State Management Considerations
- Current state is component-local, consider unified workflow state
- Progress persistence using existing store API
- Error recovery states need enhancement

### Theme Migration
Current theme uses standard Material-UI blues. New design system requires:
- Custom color palette implementation
- Typography scale adjustment
- Component style overrides for consistent appearance
- Icon system standardization

### Key UX Improvements Needed
1. **Step-based Navigation**: Replace tabs with linear workflow
2. **Visual Progress**: Add step indicator component
3. **Simplified Auth**: OAuth button instead of terminal commands
4. **Deployment Visualization**: Progress bars with human-readable status
5. **Success State**: Celebration screen with clear next steps
6. **Error Recovery**: Inline retry options, better error messages

### Data Flow Preservation
Maintain existing data flow:
- GCP auth → Project selection → Store project ID
- Terraform deployment → Store outputs
- Camera discovery → ACAP deployment
- Config generation → Camera transmission

---

## Next Steps for UI Engineer

1. Create new `WorkflowStepper` component for progress indication
2. Refactor `AutoDashboard` into step-based `SetupWizard`
3. Implement new theme with design system colors
4. Create reusable status/alert components
5. Add transition animations between steps
6. Simplify technical displays while preserving functionality

## Component Mockups and Specifications

### WorkflowStepper Component
```jsx
// Props interface
interface WorkflowStepperProps {
  currentStep: number;
  steps: Array<{
    label: string;
    description?: string;
    estimatedTime?: string;
  }>;
  onStepClick?: (step: number) => void;
}

// Visual representation
[✓] Google Login ─── [✓] Project Selection ─── [●] ACAP Deploy ─── [ ] Infrastructure ─── [ ] Configure ─── [ ] Complete
     Complete            Complete                 In Progress         Not Started         Not Started       Not Started
     (2 min)            (1 min)                  (5-10 min)          (15-20 min)         (5 min)          
```

### StatusBanner Component
```jsx
// Props interface
interface StatusBannerProps {
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  onDismiss?: () => void;
}

// Visual examples
[i] Project APIs will be enabled automatically during deployment [Dismiss]
[✓] Authentication successful! Welcome back, user@company.com
[!] Camera discovery found 2 offline devices [Retry Scan]
[x] Deployment failed: Insufficient permissions [View Details]
```

### DeploymentProgress Component
```jsx
// Props interface  
interface DeploymentProgressProps {
  tasks: Array<{
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    progress?: number;
    detail?: string;
  }>;
  overallProgress: number;
  estimatedTimeRemaining?: string;
}

// Visual representation
┌─────────────────────────────────────┐
│ Building Your Infrastructure        │
│                                     │
│ Overall Progress: 72%               │
│ ████████████████░░░░░ 3 min left   │
│                                     │
│ ✓ Project validation               │
│ ✓ Service accounts (4/4)           │
│ ⟳ API Gateway setup... 45%         │
│ ○ Security policies                │
│ ○ Final validation                 │
└─────────────────────────────────────┘
```

### CameraCard Component
```jsx
// Props interface
interface CameraCardProps {
  camera: {
    id: string;
    name: string;
    ip: string;
    status: 'online' | 'offline' | 'deploying' | 'ready';
    deploymentProgress?: number;
  };
  selected: boolean;
  onSelect: (id: string) => void;
  onAction?: (action: string, id: string) => void;
}

// Visual representation
┌─────────────────────────────────────┐
│ [✓] Axis M3065-V                    │
│     192.168.1.101 • Online          │
│     ████████████████ Ready          │
│     [Configure] [View Details]      │
└─────────────────────────────────────┘
```

### AuthenticationCard Component
```jsx
// Welcome screen auth card
┌─────────────────────────────────────┐
│        Welcome to Anava             │
│       Personal Cloud                │
│                                     │
│      [Anava Logo/Icon]              │
│                                     │
│  Deploy enterprise-grade camera     │
│  infrastructure in minutes          │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ [G] Sign in with Google     │   │
│  └─────────────────────────────┘   │
│                                     │
│  First time? [Learn More]           │
└─────────────────────────────────────┘
```

## Design Tokens (CSS Variables)

```css
:root {
  /* Colors */
  --color-primary: #0052CC;
  --color-primary-dark: #003D99;
  --color-primary-light: #4C9AFF;
  --color-success: #00875A;
  --color-warning: #FF991F;
  --color-error: #DE350B;
  --color-info: #5243AA;
  
  /* Neutrals */
  --color-background: #F7F8FA;
  --color-surface: #FFFFFF;
  --color-border: #DFE1E6;
  --color-text-primary: #172B4D;
  --color-text-secondary: #6B778C;
  
  /* Typography */
  --font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-size-h1: 32px;
  --font-size-h2: 24px;
  --font-size-h3: 20px;
  --font-size-body: 14px;
  --font-size-small: 12px;
  
  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  
  /* Shadows */
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.12);
  --shadow-hover: 0 4px 8px rgba(0, 0, 0, 0.15);
  
  /* Transitions */
  --transition-fast: 200ms ease-in-out;
  --transition-normal: 300ms ease-in-out;
}
```
The Anava desktop app is built with:
- **Frontend**: React with TypeScript and Material-UI components
- **Backend**: Electron main process with Node.js
- **IPC Communication**: contextBridge for secure renderer-main communication
- **State Management**: React hooks (useState, useEffect) - no Redux/Context API
- **Styling**: Material-UI sx prop and theme system

### Main Components

#### 1. AutoDashboard.tsx (Primary UI Component)
- **Purpose**: Main dashboard managing authentication, project selection, and deployment
- **Key Features**:
  - Google Cloud authentication status check
  - Project selection dropdown
  - Terraform deployment with real-time progress
  - Three-tab interface (Deploy, Configuration, Setup Guide)
  - Error handling and retry mechanisms
  
#### 2. DeploymentConfig.tsx
- **Purpose**: Displays Terraform outputs and allows configuration management
- **Features**:
  - Shows API Gateway URLs, API keys, Firebase config
  - Copy-to-clipboard functionality
  - Endpoint testing capabilities
  - "Send to Camera" dialog for configuration deployment
  - Test command examples

#### 3. SetupGuide.tsx
- **Purpose**: Interactive checklist for manual Firebase setup steps
- **Features**:
  - Stepper component with checkable steps
  - Direct links to Firebase/GCP consoles
  - Code snippets with copy functionality
  - Progress tracking

### IPC Communication Patterns
The app uses a well-structured IPC system via preload.js:

**Key IPC Channels**:
- `gcp:login/logout/auth-status/list-projects/set-project` - GCP authentication
- `terraform:deploy/status/outputs/destroy` - Infrastructure deployment
- `terraform:progress/error/complete` - Real-time deployment updates
- `store:get/set/delete` - Persistent storage via electron-store

**Event Flow**:
1. Renderer calls IPC method via `window.electronAPI`
2. Main process handles request in `main.js`
3. Main process sends progress events back to renderer
4. Renderer updates UI based on events

### Current User Flow
1. **Initial Load**: Check authentication status and existing deployments
2. **Authentication**: If not authenticated, show login screen with gcloud instructions
3. **Project Selection**: Dropdown to select from available GCP projects
4. **Deployment**: Big "Deploy" button triggers Terraform with real-time logs
5. **Configuration**: View deployment outputs and test endpoints
6. **Setup Guide**: Manual steps for Firebase configuration

### UI/UX Pain Points Identified

1. **Authentication Flow**:
   - Relies on terminal commands (gcloud auth login)
   - No visual feedback during auth check
   - Error messages could be more helpful

2. **Project Selection**:
   - Dropdown is functional but not prominent
   - No visual indication of project capabilities/quotas

3. **Deployment Process**:
   - Progress is shown but lacks visual appeal
   - Terminal-style logs may intimidate non-technical users
   - No clear indication of what's happening at each step

4. **Information Architecture**:
   - Tabs hide important information
   - No clear visual hierarchy
   - Configuration tab disabled until deployment complete

5. **Visual Design**:
   - Basic Material-UI styling, lacks personality
   - No consistent color scheme or branding
   - Dense information presentation

6. **Error Handling**:
   - Errors shown as text alerts
   - No suggested actions for common issues
   - Technical error messages exposed

### Technical Considerations for Improvements

1. **State Management**: Currently using component-level state. Could benefit from:
   - React Context for global state
   - Or continue with prop drilling but better organized

2. **Loading States**: Need skeleton screens and better progress indicators

3. **Animation**: Material-UI supports transitions, currently underutilized

4. **Responsive Design**: Current design assumes desktop, but Electron windows can be resized

5. **Accessibility**: Basic MUI accessibility, but could improve:
   - Keyboard navigation
   - Screen reader support
   - High contrast mode

6. **Theme Customization**: Using default MUI theme, should create custom theme

### Existing Services (Not Currently Used in UI)
The main process initializes several services that aren't integrated into the current UI:
- CameraDiscoveryService
- ACAPDeploymentService
- WebRTCOrchestrator
- QRCodeService
- AcapDownloaderService

These could be integrated into the target workflow for camera management features.

### Next Steps for Implementation
1. Await UX designer's workflow improvements and wireframes ✅
2. Implement new component structure based on designs ✅
3. Enhance loading states and animations ✅
4. Improve error handling with user-friendly messages ✅
5. Add proper theme and branding ✅
6. Integrate camera-related services into the workflow (Phase 2)

---

## UI Implementation Progress (Phase 1 MVP Complete)

### Completed Components

#### 1. Theme System (`theme.ts`)
- **Status**: ✅ Complete
- **Features**:
  - Design tokens for colors, typography, spacing, shadows, and transitions
  - Custom Material-UI theme based on UX specifications
  - Consistent component styling overrides
  - Professional enterprise color palette

#### 2. WorkflowStepper Component
- **Status**: ✅ Complete
- **Features**:
  - Visual step progression with 6 steps
  - Active step pulsing animation
  - Completed steps with checkmarks
  - Time estimates for each step
  - Click navigation for completed steps

#### 3. StatusBanner Component
- **Status**: ✅ Complete
- **Features**:
  - Supports info, success, warning, error states
  - Optional action buttons
  - Dismissible with animation
  - Auto-dismiss for success messages
  - Smooth slide-in animation

#### 4. SetupWizard Component (Replaces AutoDashboard)
- **Status**: ✅ Complete
- **Features**:
  - Linear workflow replacing tabbed interface
  - Step-based navigation with back/forward
  - Integrated authentication with visual OAuth button
  - Project selection with validation indicators
  - Infrastructure deployment with DeploymentProgress component
  - Camera configuration step
  - Success/completion screen

#### 5. DeploymentProgress Component
- **Status**: ✅ Complete
- **Features**:
  - Visual task list with status indicators
  - Overall progress bar with gradient
  - Time remaining estimation
  - Animated success state
  - Collapsible logs section

#### 6. DeploymentConfigNew Component
- **Status**: ✅ Complete
- **Features**:
  - Simplified configuration summary
  - Camera selection interface
  - Secure configuration sending
  - Advanced details collapsible section
  - Improved visual hierarchy
  - Copy functionality with feedback

#### 7. CameraCard Component
- **Status**: ✅ Complete (Ready for future use)
- **Features**:
  - Visual camera status representation
  - Deployment progress tracking
  - Selection checkbox
  - Action buttons based on status
  - Hover effects and transitions

### Key Improvements Implemented

1. **Visual Design**
   - Applied new color palette throughout
   - Consistent spacing and typography
   - Professional card-based layouts
   - Smooth transitions and animations

2. **User Experience**
   - Linear workflow guides users step-by-step
   - Clear progress indication at all times
   - Simplified technical information display
   - User-friendly error messages
   - Visual feedback for all actions

3. **Authentication Flow**
   - Replaced terminal commands with OAuth button
   - Clear requirements display
   - Loading states during auth check
   - Friendly welcome screen

4. **Deployment Experience**
   - Real-time progress visualization
   - Human-readable task names
   - Collapsible technical logs
   - Success celebrations

5. **Configuration Management**
   - Simplified configuration display
   - One-click "Send to Camera" action
   - Security-first messaging
   - Easy copy functionality

### Technical Notes

- All existing IPC communication preserved
- Backend functionality unchanged
- TypeScript interfaces maintained
- Component modularity improved
- Cross-platform compatibility maintained

### Remaining Tasks for Phase 2

1. **Camera Discovery Integration**
   - Connect CameraDiscoveryService to UI
   - Implement camera list in step 3
   - Real-time discovery updates

2. **ACAP Deployment Integration**
   - Connect ACAPDeploymentService
   - Show real deployment progress
   - Handle deployment errors gracefully

3. **Enhanced Animations**
   - Page transition effects
   - Skeleton loaders for data fetching
   - Micro-interactions on buttons

4. **Persistence**
   - Save workflow progress
   - Resume from last step
   - Remember user preferences

5. **Help System**
   - Contextual tooltips
   - Inline documentation
   - Video tutorials placeholder

### Files Modified/Created

1. `/src/renderer/src/theme.ts` - New design system theme
2. `/src/renderer/src/components/WorkflowStepper.tsx` - Step progress indicator
3. `/src/renderer/src/components/StatusBanner.tsx` - Alert/status messages
4. `/src/renderer/src/components/SetupWizard.tsx` - Main workflow component
5. `/src/renderer/src/components/DeploymentProgress.tsx` - Deployment visualization
6. `/src/renderer/src/components/DeploymentConfigNew.tsx` - Updated config UI
7. `/src/renderer/src/components/CameraCard.tsx` - Camera display component
8. `/src/renderer/src/App.tsx` - Updated to use new theme and components

### Testing Notes

The new UI maintains all existing functionality while providing a significantly improved user experience. The linear workflow successfully guides users through the complex deployment process with clear visual feedback at every step.