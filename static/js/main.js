document.addEventListener('DOMContentLoaded', function() {
    // --- Global state variables ---
    let state = {
        videos: [],
        currentVideo: null,
        folders: [],
        tasks: [],
        names: [],
        currentFolderIndex: 0,
        currentFrameIndex: 0, // 0-999
        imageCache: new Set(),
        currentTaskIndex: -1, // Currently selected task index
        existingAnnotations: new Map(), // Store annotations loaded from server: taskIndex -> {frame, name}
    };

    // --- DOM element references ---
    const DOMElements = {
        videoSelect: document.getElementById('video-select'),
        taskList: document.getElementById('task-list'),
        taskProgress: document.getElementById('task-progress'),
        nameList: document.getElementById('name-list'),
        folderSlider: document.getElementById('folder-slider'),
        frameSlider: document.getElementById('frame-slider'),
        folderSliderLabel: document.getElementById('folder-slider-label'),
        frameSliderLabel: document.getElementById('frame-slider-label'),
        currentFolderDisplay: document.getElementById('current-folder-display'),
        frameInfoDisplay: document.getElementById('frame-info-display'),
        frameImage: document.getElementById('frame-image'),
        
        // Folder navigation buttons
        btnFolderPrev10: document.getElementById('btn-folder-prev-10'),
        btnFolderPrev1: document.getElementById('btn-folder-prev-1'),
        btnFolderNext1: document.getElementById('btn-folder-next-1'),
        btnFolderNext10: document.getElementById('btn-folder-next-10'),
        
        // Frame navigation buttons
        btnFramePrev10: document.getElementById('btn-frame-prev-10'),
        btnFramePrev1: document.getElementById('btn-frame-prev-1'),
        btnFrameNext1: document.getElementById('btn-frame-next-1'),
        btnFrameNext10: document.getElementById('btn-frame-next-10'),
        
        toast: document.getElementById('toast'),
    };

    // --- Keyboard navigation state ---
    let keyboardState = {
        frameInterval: null,
        frameSpeed: 50, // Faster response for smooth navigation
        currentDirection: 0, // Track movement direction for smart preloading
    };

    // --- Utility functions ---
    function showToast(message) {
        DOMElements.toast.textContent = message;
        DOMElements.toast.className = "show";
        setTimeout(() => { DOMElements.toast.className = DOMElements.toast.className.replace("show", ""); }, 3000);
    }
    
    /**
     * Smart preload - dynamically adjust based on movement direction and speed
     * @param {number} centerFolderIdx - Center folder index
     * @param {number} centerFrameIdx - Center frame index (0-999)
     * @param {number} direction - Movement direction (-1 for left, 1 for right, 0 for static)
     */
    function preloadImages(centerFolderIdx, centerFrameIdx, direction = 0) {
        if (!state.currentVideo || state.folders.length === 0) return;

        // Dynamic preload strategy based on movement direction
        let preloadForward, preloadBackward;
        if (direction > 0) {
            // Moving right - preload more in the forward direction (higher frame numbers)
            preloadForward = 15;
            preloadBackward = 5;
        } else if (direction < 0) {
            // Moving left - preload more in the backward direction (lower frame numbers)
            preloadForward = 5;
            preloadBackward = 15;
        } else {
            // Static or initial load - balanced preload
            preloadForward = 10;
            preloadBackward = 10;
        }

        const currentFolderName = state.folders[centerFolderIdx];
        if (!currentFolderName) return; // Safety check
        
        const currentFolderStart = parseInt(currentFolderName.split('_')[0], 10);
        const centerAbsoluteFrame = currentFolderStart + centerFrameIdx;

        console.log(`DEBUG: Preloading - direction: ${direction}, forward: ${preloadForward}, backward: ${preloadBackward}, center frame: ${centerAbsoluteFrame}`);

        for (let i = -preloadBackward; i <= preloadForward; i++) {
            if (i === 0) continue; // Skip current image

            const targetAbsoluteFrame = centerAbsoluteFrame + i;

            // Find target frame's folder by searching
            let targetFolderName = '';
            let targetFolderStart = 0;

            for (const folder of state.folders) {
                const start = parseInt(folder.split('_')[0], 10);
                const end = parseInt(folder.split('_')[1], 10);
                if (targetAbsoluteFrame >= start && targetAbsoluteFrame <= end) {
                    targetFolderName = folder;
                    targetFolderStart = start;
                    break;
                }
            }

            if (targetFolderName) {
                const targetFrameIdx = targetAbsoluteFrame - targetFolderStart;
                // 【Key fix】Change filename to 6 digits
                const imageFile = String(targetFrameIdx).padStart(6, '0') + '.jpg';
                const imagePath = `/static/frames/${state.currentVideo}/${targetFolderName}/${imageFile}`;

                if (!state.imageCache.has(imagePath)) {
                    const img = new Image();
                    img.src = imagePath;
                    state.imageCache.add(imagePath);
                    console.log(`DEBUG: Preloading image: ${imagePath}`);
                }
            }
        }

        // Clean up cache if it gets too large (keep only most recent 100 images)
        if (state.imageCache.size > 100) {
            const cacheArray = Array.from(state.imageCache);
            const toRemove = cacheArray.slice(0, state.imageCache.size - 80); // Keep 80 most recent
            toRemove.forEach(path => state.imageCache.delete(path));
            console.log(`DEBUG: Cache cleaned, removed ${toRemove.length} old images`);
        }
    }

    function updateView() {
        if (!state.currentVideo || state.folders.length === 0) {
            DOMElements.frameImage.src = `https://placehold.co/1280x720/000000/FFFFFF?text=No+Data+For+${state.currentVideo}`;
            return;
        }
        state.currentFolderIndex = Math.max(0, Math.min(state.folders.length - 1, state.currentFolderIndex));
        state.currentFrameIndex = Math.max(0, Math.min(999, state.currentFrameIndex));
        
        const folderName = state.folders[state.currentFolderIndex];
        if (!folderName) {
            console.error("DEBUG: Invalid folder index:", state.currentFolderIndex);
            return;
        }

        // 【Key fix】Change filename to 6 digits
        const imageFile = String(state.currentFrameIndex).padStart(6, '0') + '.jpg';
        const imagePath = `/static/frames/${state.currentVideo}/${folderName}/${imageFile}`;
        DOMElements.frameImage.src = imagePath;
        DOMElements.frameImage.onerror = () => {
             DOMElements.frameImage.src = `https://placehold.co/1280x720/000000/FFFFFF?text=Image+Not+Found`;
             console.error(`DEBUG: Image not found: ${imagePath}`);
        };
        
        // Update sliders
        DOMElements.folderSlider.value = state.currentFolderIndex;
        DOMElements.frameSlider.value = state.currentFrameIndex;
        
        // Update labels
        DOMElements.folderSliderLabel.textContent = `Folder (${state.currentFolderIndex + 1} / ${state.folders.length})`;
        DOMElements.frameSliderLabel.textContent = `Frame (${state.currentFrameIndex})`;
        
        // Display folder name in the button area
        DOMElements.currentFolderDisplay.textContent = folderName;
        
        // Calculate absolute frame and time
        const folderStartFrame = parseInt(folderName.split('_')[0], 10);
        const absoluteFrame = folderStartFrame + state.currentFrameIndex;
        const timeInSeconds = Math.floor(absoluteFrame / 25);
        const hh = String(Math.floor(timeInSeconds / 3600)).padStart(2, '0');
        const mm = String(Math.floor((timeInSeconds % 3600) / 60)).padStart(2, '0');
        const ss = String(timeInSeconds % 60).padStart(2, '0');
        
        // Display time and absolute frame in the button area
        DOMElements.frameInfoDisplay.textContent = `Time: ${hh}:${mm}:${ss} | Absolute Frame: ${absoluteFrame}`;
        
        // Update name list to reflect current frame's annotation status
        renderNameList();
    }

    /**
     * 【Fixed】Jump to specified position based on absolute frame number, correctly handle non-continuous folders
     * @param {number} absoluteFrame - Target frame's absolute number
     */
    function goToAbsoluteFrame(absoluteFrame) {
        if (state.folders.length === 0) return;

        let targetFolderIndex = -1;
        // Find correct folder by iterating through search
        for (let i = 0; i < state.folders.length; i++) {
            const folderName = state.folders[i];
            const folderStart = parseInt(folderName.split('_')[0], 10);
            const folderEnd = parseInt(folderName.split('_')[1], 10);
            if (absoluteFrame >= folderStart && absoluteFrame <= folderEnd) {
                targetFolderIndex = i;
                break;
            }
        }

        if (targetFolderIndex !== -1) {
            const folderStartFrame = parseInt(state.folders[targetFolderIndex].split('_')[0], 10);
            const targetFrameIndex = absoluteFrame - folderStartFrame;

            state.currentFolderIndex = targetFolderIndex;
            state.currentFrameIndex = targetFrameIndex;
            updateView();
            preloadImages(state.currentFolderIndex, state.currentFrameIndex, 0); // Static preload
        } else {
            showToast(`Error: Frame ${absoluteFrame} is outside any known folder range.`);
            console.error(`DEBUG: Cannot find frame ${absoluteFrame} in any folder.`);
        }
    }

    function renderTaskList() {
        DOMElements.taskList.innerHTML = '';
        if (state.tasks.length === 0) {
            DOMElements.taskList.innerHTML = '<p class="text-gray-500">No tasks for this video</p>';
            DOMElements.taskProgress.textContent = '(0/0)';
            return;
        }
        
        // Count finished tasks
        let finishedCount = 0;
        state.tasks.forEach((task, index) => {
            if (state.existingAnnotations.has(index)) {
                finishedCount++;
            }
        });
        
        // Update progress display
        DOMElements.taskProgress.textContent = `(${finishedCount}/${state.tasks.length})`;
        
        state.tasks.forEach((task, index) => {
            const taskEl = document.createElement('div');
            taskEl.className = 'task-item p-2 rounded-md border';
            
            // Check if this task has been annotated (from server data)
            const isAnnotated = state.existingAnnotations.has(index);
            const isCurrentTask = state.currentTaskIndex === index;
            
            if (isAnnotated) {
                taskEl.classList.add('bg-green-100', 'border-green-300');
            }
            if (isCurrentTask) {
                taskEl.classList.add('bg-blue-100', 'border-blue-300');
            }
            
            let displayText = `${index + 1}: ${task.name} (${task.frame})`;
            if (isAnnotated) {
                const annotation = state.existingAnnotations.get(index);
                displayText += ` ✓ [${annotation.name} @ ${annotation.frame}]`;
            }
            
            taskEl.textContent = displayText;
            taskEl.dataset.taskIndex = index;
            taskEl.dataset.frame = task.frame;
            taskEl.addEventListener('click', () => {
                selectTask(index);
            });
            DOMElements.taskList.appendChild(taskEl);
        });
    }

    function selectTask(taskIndex) {        
        state.currentTaskIndex = taskIndex;
        const task = state.tasks[taskIndex];
        
        // If this task has a saved annotation, go to that frame
        if (state.existingAnnotations.has(taskIndex)) {
            const annotation = state.existingAnnotations.get(taskIndex);
            goToAbsoluteFrame(annotation.frame);
        } else {
            // Otherwise go to the original task frame
            goToAbsoluteFrame(parseInt(task.frame, 10));
        }
        
        renderTaskList();
    }

    function renderNameList() {
        DOMElements.nameList.innerHTML = '';
        if (state.names.length === 0) {
            DOMElements.nameList.innerHTML = '<p class="text-gray-500">No names for this video</p>';
            return;
        }
        
        // Calculate current absolute frame for comparison
        const currentAbsoluteFrame = getCurrentAbsoluteFrame();
        
        state.names.forEach(name => {
            const nameEl = document.createElement('div');
            nameEl.className = 'name-item p-2 rounded-md border text-center font-semibold';
            nameEl.textContent = name;
            nameEl.dataset.name = name;
            
            // Check if this name should be highlighted (green)
            // Only highlight if we're viewing a task that has been annotated with this name at this exact frame
            let shouldHighlight = false;
            if (state.currentTaskIndex !== -1 && state.existingAnnotations.has(state.currentTaskIndex)) {
                const annotation = state.existingAnnotations.get(state.currentTaskIndex);
                shouldHighlight = (annotation.name === name && annotation.frame === currentAbsoluteFrame);
            }
            
            if (shouldHighlight) {
                nameEl.classList.add('selected', 'bg-green-500', 'text-white');
            }
            
            nameEl.addEventListener('click', () => {
                // Remove selection from all name items
                document.querySelectorAll('.name-item').forEach(el => el.classList.remove('selected', 'bg-green-500', 'text-white'));
                // Add selection to clicked item
                nameEl.classList.add('selected', 'bg-green-500', 'text-white');
                saveAnnotation(name);
            });
            DOMElements.nameList.appendChild(nameEl);
        });
    }
    
    function getCurrentAbsoluteFrame() {
        if (state.folders.length === 0) return 0;
        const folderName = state.folders[state.currentFolderIndex];
        const folderStartFrame = parseInt(folderName.split('_')[0], 10);
        return folderStartFrame + state.currentFrameIndex;
    }

    async function loadVideoData(videoName) {
        if (!videoName) return;
        console.log(`DEBUG: Starting to load data for video: ${videoName}`);
        state.currentVideo = videoName;
        state.imageCache.clear();
        
        try {
            const response = await fetch(`/api/video_data/${videoName}`);
            const responseText = await response.text();
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status} ${response.statusText}`);
            }

            const data = JSON.parse(responseText);
            
            state.folders = data.folders || [];
            state.tasks = data.tasks || [];
            state.names = data.names || [];
            state.currentTaskIndex = -1; // Reset task selection
            state.existingAnnotations.clear(); // Clear previous annotations
            
            // Restore existing annotations from server
            if (data.existing_annotations) {
                for (const [taskIndex, annotation] of Object.entries(data.existing_annotations)) {
                    state.existingAnnotations.set(parseInt(taskIndex), annotation);
                }
            }

            // On initial load, jump to first task's frame instead of (0,0)
            if (state.tasks.length > 0 && state.folders.length > 0) {
                selectTask(0); // Select the first task
            } else if (state.folders.length > 0) {
                // If no tasks, show first frame of first folder
                state.currentFolderIndex = 0;
                state.currentFrameIndex = 0;
                updateView();
                preloadImages(0, 0, 0); // Static preload
            } else {
                updateView();
            }
            
            DOMElements.folderSlider.max = state.folders.length > 0 ? state.folders.length - 1 : 0;
            renderTaskList();
            renderNameList();

        } catch (error) {
            console.error('DEBUG: Failed to load video data:', error);
            showToast(`Failed to load video data: ${error.message}`);
            DOMElements.taskList.innerHTML = `<p class="text-red-500">Loading failed: ${error.message}</p>`;
            DOMElements.nameList.innerHTML = `<p class="text-red-500">Loading failed</p>`;
        }
    }
    
    async function saveAnnotation(name) {
        if (!state.currentVideo) {
            showToast("Please select a video first");
            return;
        }
        
        const folderName = state.folders[state.currentFolderIndex];
        const imageFile = String(state.currentFrameIndex).padStart(6, '0') + '.jpg';
        const folderStartFrame = parseInt(folderName.split('_')[0], 10);
        const absoluteFrame = folderStartFrame + state.currentFrameIndex;
        
        const annotationData = {
            video: state.currentVideo,
            folder: folderName,
            imageFile: imageFile,
            absoluteFrame: absoluteFrame,
            name: name,
            taskIndex: state.currentTaskIndex // Include task index in the annotation
        };
        
        try {
            const response = await fetch('/api/annotate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(annotationData),
            });
            const result = await response.json();
            if (response.ok) {
                let message = `Success: ${name} @ Frame ${absoluteFrame}`;
                if (state.currentTaskIndex !== -1) {
                    message += ` (Task ${state.currentTaskIndex + 1})`;
                    // Update local state with new annotation
                    state.existingAnnotations.set(state.currentTaskIndex, {
                        frame: absoluteFrame,
                        name: name
                    });
                    renderTaskList(); // Update the task list to show the annotation
                    renderNameList(); // Update the name list to show the current selection
                }
                showToast(message);
            } else {
                throw new Error(result.message || 'Unknown error');
            }
        } catch (error) {
            console.error('DEBUG: Failed to save annotation:', error);
            showToast(`Save failed: ${error.message}`);
        }
    }

    // --- Keyboard navigation functions ---
    function moveFrame(direction) {
        state.currentFrameIndex = Math.max(0, Math.min(999, state.currentFrameIndex + direction));
        updateView();
        // Smart preload with direction awareness
        preloadImages(state.currentFolderIndex, state.currentFrameIndex, direction);
    }

    function startFrameMovement(direction) {
        if (keyboardState.frameInterval) return; // Already moving
        
        // Store current direction for smart preloading
        keyboardState.currentDirection = direction;
        
        // Initial movement
        moveFrame(direction);
        
        // Set up continuous movement with consistent speed
        keyboardState.frameInterval = setInterval(() => {
            moveFrame(direction);
        }, keyboardState.frameSpeed);
    }

    function stopFrameMovement() {
        if (keyboardState.frameInterval) {
            clearInterval(keyboardState.frameInterval);
            keyboardState.frameInterval = null;
            keyboardState.currentDirection = 0; // Reset direction
        }
    }

    // --- Event listeners ---
    DOMElements.videoSelect.addEventListener('change', (e) => loadVideoData(e.target.value));
    DOMElements.folderSlider.addEventListener('input', (e) => { state.currentFolderIndex = parseInt(e.target.value, 10); updateView(); });
    DOMElements.folderSlider.addEventListener('change', () => preloadImages(state.currentFolderIndex, state.currentFrameIndex, 0));
    DOMElements.frameSlider.addEventListener('input', (e) => { state.currentFrameIndex = parseInt(e.target.value, 10); updateView(); });
    DOMElements.frameSlider.addEventListener('change', () => preloadImages(state.currentFolderIndex, state.currentFrameIndex, 0));
    
    // Folder navigation buttons
    const setupFolderNavButton = (button, folderChange) => {
        button.addEventListener('click', () => {
            const maxFolder = state.folders.length - 1;
            state.currentFolderIndex = Math.max(0, Math.min(maxFolder, state.currentFolderIndex + folderChange));
            updateView();
            preloadImages(state.currentFolderIndex, state.currentFrameIndex, 0); // Static preload for button clicks
        });
    };
    setupFolderNavButton(DOMElements.btnFolderPrev10, -10);
    setupFolderNavButton(DOMElements.btnFolderPrev1, -1);
    setupFolderNavButton(DOMElements.btnFolderNext1, 1);
    setupFolderNavButton(DOMElements.btnFolderNext10, 10);
    
    // Frame navigation buttons
    const setupFrameNavButton = (button, frameChange) => {
        button.addEventListener('click', () => {
            state.currentFrameIndex = Math.max(0, Math.min(999, state.currentFrameIndex + frameChange));
            updateView();
            // Use direction-aware preloading for button clicks
            const direction = frameChange > 0 ? 1 : frameChange < 0 ? -1 : 0;
            preloadImages(state.currentFolderIndex, state.currentFrameIndex, direction);
        });
    };
    setupFrameNavButton(DOMElements.btnFramePrev10, -10);
    setupFrameNavButton(DOMElements.btnFramePrev1, -1);
    setupFrameNavButton(DOMElements.btnFrameNext1, 1);
    setupFrameNavButton(DOMElements.btnFrameNext10, 10);

    // --- Keyboard event listeners ---
    document.addEventListener('keydown', (e) => {
        // Prevent default behavior for our handled keys
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            e.preventDefault();
            
            // Check if this is the first press (not a repeat)
            if (!keyboardState.frameInterval) {
                // Arrow keys for frame navigation only
                if (e.key === 'ArrowLeft') {
                    startFrameMovement(-1);
                } else if (e.key === 'ArrowRight') {
                    startFrameMovement(1);
                }
            }
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            stopFrameMovement();
        }
    });

    // Stop movement when window loses focus
    window.addEventListener('blur', () => {
        stopFrameMovement();
    });

    // --- Initialization ---
    async function init() {
        try {
            const response = await fetch('/api/videos');
            state.videos = await response.json();
            DOMElements.videoSelect.innerHTML = '<option value="">-- Please select a video --</option>';
            state.videos.forEach(video => {
                const option = document.createElement('option');
                option.value = video;
                option.textContent = video;
                DOMElements.videoSelect.appendChild(option);
            });
            if (state.videos.length > 0) {
                DOMElements.videoSelect.value = state.videos[0];
                await loadVideoData(state.videos[0]);
            } else {
                 DOMElements.videoSelect.innerHTML = '<option>No video directories found</option>';
                 showToast("Error: No video folders found in static/frames/ directory.");
            }
        } catch (error) {
            console.error('DEBUG: Initialization failed:', error);
            DOMElements.videoSelect.innerHTML = '<option>Failed to load video list</option>';
            showToast("Initialization failed, please check if backend service is running.");
        }
    }

    init();
});
