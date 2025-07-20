# UX Design Quick Reference

## 🎯 Core Objective
Transform the technical Terraform deployment tool into a polished, enterprise-ready "Anava Personal Cloud" setup wizard with a streamlined 6-step workflow.

## 🎨 Visual Identity

### Colors
- **Primary**: #0052CC (Professional Blue)
- **Success**: #00875A (Green)
- **Warning**: #FF991F (Amber)
- **Error**: #DE350B (Red)
- **Background**: #F7F8FA (Light Gray)

### Typography
- **Font**: Inter (with system fallbacks)
- **H1**: 32px, 600 weight
- **Body**: 14px, 400 weight
- **Buttons**: 14px, 500 weight

## 📐 6-Step Workflow

1. **Welcome & Auth** → Google OAuth login
2. **Project Selection** → Choose GCP project
3. **ACAP Deploy** → Install camera software
4. **Infrastructure** → Deploy cloud services
5. **Configure** → Send config to cameras
6. **Success** → Celebrate & next steps

## 🔑 Key UX Principles

### Do's ✅
- Show clear progress with visual stepper
- Use plain language, avoid technical jargon
- Provide time estimates for each step
- Celebrate success with clear next steps
- Auto-retry on failures with user notification

### Don'ts ❌
- Don't show terminal commands in UI
- Don't expose raw JSON to users
- Don't use technical error messages
- Don't require manual navigation between steps
- Don't hide important status information

## 🧩 Component Hierarchy

```
SetupWizard (Main Container)
├── WorkflowStepper (Progress indicator)
├── StepContent (Dynamic per step)
│   ├── WelcomeStep
│   ├── ProjectSelectionStep
│   ├── ACAPDeploymentStep
│   ├── InfrastructureStep
│   ├── ConfigurationStep
│   └── SuccessStep
├── StatusBanner (Contextual messages)
└── NavigationButtons (Back/Next/Skip)
```

## 📱 Responsive Behavior
- Desktop-first design (Electron app)
- Minimum 768px width
- Cards stack vertically on smaller screens
- Touch-friendly 44px tap targets

## ⚡ Quick Implementation Checklist

- [ ] Replace tab navigation with step-based flow
- [ ] Implement WorkflowStepper component
- [ ] Create unified theme with new colors
- [ ] Simplify authentication to OAuth button
- [ ] Add progress animations
- [ ] Create success celebration screen
- [ ] Implement inline error recovery
- [ ] Add time estimates to all operations
- [ ] Create help tooltips for complex concepts
- [ ] Test entire flow end-to-end

## 🎯 Success Metrics
- User completes setup in < 30 minutes
- Zero terminal commands shown
- All errors have recovery actions
- Progress never appears stuck
- Users understand what's happening at each step