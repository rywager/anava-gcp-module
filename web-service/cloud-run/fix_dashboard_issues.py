#!/usr/bin/env python3
"""
Fix dashboard CSS and progress update issues
"""

def create_css_patch():
    """Create CSS patch for missing styles"""
    
    css_patch = '''
        /* Wizard Steps */
        .wizard-step {
            padding: 2rem;
        }

        .wizard-header {
            text-align: center;
            margin-bottom: 3rem;
        }

        .wizard-header h2 {
            font-size: 1.875rem;
            font-weight: 700;
            color: var(--text-primary);
            margin-bottom: 0.5rem;
        }

        .wizard-header p {
            color: var(--text-secondary);
            font-size: 1rem;
        }

        .wizard-content {
            max-width: 800px;
            margin: 0 auto;
        }

        /* Project Selection */
        .loading-message {
            text-align: center;
            padding: 3rem;
            color: var(--text-secondary);
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
        }

        .projects-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 1rem;
        }

        .project-card {
            background: var(--bg-dark);
            border: 1px solid var(--border);
            border-radius: 0.75rem;
            padding: 1.5rem;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .project-card:hover {
            border-color: var(--primary);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        }

        .project-card h3 {
            font-size: 1.125rem;
            font-weight: 600;
            color: var(--text-primary);
            margin-bottom: 0.25rem;
        }

        .project-card p {
            color: var(--text-secondary);
            font-size: 0.875rem;
            font-family: 'SF Mono', Monaco, monospace;
        }

        /* Form Styles */
        .form-group {
            margin-bottom: 1.5rem;
        }

        .form-group label {
            display: block;
            font-weight: 500;
            color: var(--text-primary);
            margin-bottom: 0.5rem;
            font-size: 0.875rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .form-group input,
        .form-group select {
            width: 100%;
            background: var(--bg-dark);
            border: 1px solid var(--border);
            border-radius: 0.5rem;
            padding: 0.75rem 1rem;
            color: var(--text-primary);
            font-size: 1rem;
            transition: all 0.2s ease;
        }

        .form-group input:focus,
        .form-group select:focus {
            outline: none;
            border-color: var(--primary);
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
        }

        .form-group small {
            display: block;
            margin-top: 0.375rem;
            color: var(--text-secondary);
            font-size: 0.813rem;
        }

        .form-actions {
            display: flex;
            gap: 1rem;
            justify-content: flex-end;
            margin-top: 2rem;
            padding-top: 2rem;
            border-top: 1px solid var(--border);
        }

        /* Button Styles */
        .btn {
            padding: 0.75rem 1.5rem;
            border-radius: 0.5rem;
            font-weight: 600;
            font-size: 0.875rem;
            border: none;
            cursor: pointer;
            transition: all 0.2s ease;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
        }

        .btn-primary {
            background: var(--primary);
            color: white;
        }

        .btn-primary:hover {
            background: var(--primary-dark);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
        }

        .btn-secondary {
            background: var(--bg-hover);
            color: var(--text-primary);
            border: 1px solid var(--border);
        }

        .btn-secondary:hover {
            background: var(--bg-dark);
            border-color: var(--primary);
        }

        .btn-sm {
            padding: 0.5rem 1rem;
            font-size: 0.813rem;
        }

        /* Error Message */
        .error {
            color: var(--error);
            text-align: center;
            padding: 1rem;
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 0.5rem;
        }'''
    
    return css_patch

def create_progress_fix():
    """Create JavaScript fix for progress parsing"""
    
    js_fix = '''
        // Process progress update - FIXED VERSION
        function processProgressMessage(message) {
            console.log('Processing progress:', message);
            
            // Extract resource creation progress
            const resourceMatch = message.match(/Created resource (\d+)(?:\/(\d+))?: (.+)/);
            if (resourceMatch) {
                const [_, current, total, resourceName] = resourceMatch;
                
                // Update resource counter
                document.getElementById('resource-count').textContent = current;
                
                // Parse resource type
                const resourceType = resourceName.split('.')[0];
                if (!resourceCounts[resourceType]) {
                    resourceCounts[resourceType] = 0;
                }
                resourceCounts[resourceType]++;
                
                // Update resource grid
                updateResourceGrid();
                
                // Update progress percentage - handle cases where total might not be provided
                if (total) {
                    const percent = Math.round((parseInt(current) / parseInt(total)) * 100);
                    document.getElementById('progress-percent').textContent = `${percent}%`;
                    document.getElementById('progress-bar').style.width = `${percent}%`;
                } else {
                    // If no total, just show the count
                    document.getElementById('progress-percent').textContent = `${current} resources`;
                }
                
                // Find active step and update its details
                const activeStep = deploymentSteps.find(s => {
                    const el = document.getElementById(`step-${s.id}`);
                    return el && el.classList.contains('active');
                });
                
                if (activeStep) {
                    updateStepStatus(activeStep.id, 'active', {
                        'Progress': total ? `${current} of ${total} resources created` : `${current} resources created`
                    });
                }
            }
        }'''
    
    return js_fix

def create_full_patch():
    """Create a complete patch file"""
    
    # Read current dashboard
    with open('templates/dashboard.html', 'r') as f:
        content = f.read()
    
    # Find where to insert CSS (before closing </style>)
    style_end = content.find('</style>')
    css_patch = create_css_patch()
    
    # Insert CSS
    new_content = content[:style_end] + css_patch + '\n    ' + content[style_end:]
    
    # Update version display
    new_content = new_content.replace('v2.3.7', 'v2.3.8')
    
    # Find and replace the processProgressMessage function
    func_start = new_content.find('function processProgressMessage(message) {')
    if func_start != -1:
        # Find the end of the function
        brace_count = 0
        pos = func_start
        func_end = -1
        
        while pos < len(new_content):
            if new_content[pos] == '{':
                brace_count += 1
            elif new_content[pos] == '}':
                brace_count -= 1
                if brace_count == 0:
                    func_end = pos + 1
                    break
            pos += 1
        
        if func_end != -1:
            # Replace the function
            new_content = new_content[:func_start] + create_progress_fix().strip() + new_content[func_end:]
    
    # Write the patched file
    with open('templates/dashboard_fixed.html', 'w') as f:
        f.write(new_content)
    
    print("✅ Created dashboard_fixed.html with:")
    print("- Missing CSS for project selection and forms")
    print("- Fixed progress parsing for X/Y format")
    print("- Updated version to v2.3.8")
    print("- Added debug logging for progress updates")

if __name__ == "__main__":
    create_full_patch()
    print("\nTo apply the fix:")
    print("1. Review templates/dashboard_fixed.html")
    print("2. Copy it to templates/dashboard.html")
    print("3. Redeploy the service")