import os
import json
import pandas as pd
import numpy as np # Import numpy to handle NaN
from flask import Flask, render_template, jsonify, request, abort

# Initialize Flask application
app = Flask(__name__)

# --- Configuration ---
FRAMES_BASE_DIR = "frames"
LABEL_DIR = "label"
ANNOTATIONS_DIR = "annotations"  # Directory for annotation files

# --- Helper functions ---
def get_annotation_file_path(video_name):
    """Get annotation file path for a specific video"""
    if not os.path.exists(ANNOTATIONS_DIR):
        os.makedirs(ANNOTATIONS_DIR)
    return os.path.join(ANNOTATIONS_DIR, f"{video_name}_annotations.json")

def get_video_dirs():
    """Get all video dataset directory names"""
    static_frames_path = os.path.join('static', FRAMES_BASE_DIR)
    if not os.path.exists(static_frames_path):
        os.makedirs(static_frames_path)
        print(f"DEBUG: Created directory {static_frames_path}. Please place your video frame folders here.")
        return []
    return sorted([d for d in os.listdir(static_frames_path) if os.path.isdir(os.path.join(static_frames_path, d))])

def get_folder_list(video_dir):
    """Get all frame folders for specified video and sort them"""
    video_path = os.path.join('static', FRAMES_BASE_DIR, video_dir)
    if not os.path.isdir(video_path):
        return []
    return sorted(
        [f for f in os.listdir(video_path) if os.path.isdir(os.path.join(video_path, f))],
        key=lambda x: int(x.split('_')[0])
    )

def read_label_csv(video_dir):
    """Read corresponding CSV label file"""
    base_name = video_dir.replace('_VIDEO', '')
    csv_filename = f"{base_name}_label_combined.csv"
    csv_path = os.path.join(LABEL_DIR, csv_filename)

    print(f"DEBUG: Attempting to read CSV at: {csv_path}") # Debug info
    if not os.path.exists(csv_path):
        print(f"DEBUG: CSV file not found at {csv_path}")
        return pd.DataFrame(), []

    try:
        df = pd.read_csv(csv_path)
        print("DEBUG: CSV file read successfully. First 5 rows:") # Debug info
        print(df.head())
        
        # 【Key fix】Replace NaN in DataFrame with None for correct JSON null conversion
        # Use numpy's nan and pandas' NA for replacement
        df = df.replace({np.nan: None})

        print("DEBUG: DataFrame after replacing NaN with None:") # Debug info
        print(df.head())

        if 'frame' in df.columns:
            df['frame'] = pd.to_numeric(df['frame'], errors='coerce').fillna(0).astype(int)
        
        unique_names = sorted(df['name'].dropna().unique().tolist()) if 'name' in df.columns else []
        return df, unique_names
    except Exception as e:
        print(f"ERROR: Failed to read or process CSV file {csv_path}. Error: {e}")
        return pd.DataFrame(), []


# --- Flask routes ---
@app.route('/')
def index():
    """Render main page"""
    return render_template('index.html')

@app.route('/api/videos')
def list_videos():
    """API: Return all available video list"""
    videos = get_video_dirs()
    print(f"DEBUG: Found video directories: {videos}") # Debug info
    return jsonify(videos)

@app.route('/api/video_data/<video_dir>')
def get_video_data(video_dir):
    """API: Return all related data for specified video"""
    if '..' in video_dir or video_dir.startswith('/'):
        abort(400, "Invalid video directory name.")

    if video_dir not in get_video_dirs():
        abort(404, "Video directory not found.")
        
    print(f"DEBUG: Loading data for video: {video_dir}") # Debug info
    folders = get_folder_list(video_dir)
    df, names = read_label_csv(video_dir)
    
    tasks = df.to_dict('records')
    
    # Load existing annotations for this video
    existing_annotations = {}
    annotation_file = get_annotation_file_path(video_dir)
    try:
        with open(annotation_file, 'r', encoding='utf-8') as f:
            annotations = json.load(f)
            for ann in annotations:
                if 'task_index' in ann:
                    existing_annotations[ann['task_index']] = {
                        'frame': ann['absolute_frame'],
                        'name': ann['name']
                    }
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    
    response_data = {
        'folders': folders,
        'tasks': tasks,
        'names': names,
        'existing_annotations': existing_annotations
    }
    
    print(f"DEBUG: Sending data for {video_dir}. Folders count: {len(folders)}, Tasks count: {len(tasks)}, Names count: {len(names)}, Annotations count: {len(existing_annotations)}") # Debug info
    return jsonify(response_data)

@app.route('/api/annotate', methods=['POST'])
def save_annotation():
    """API: Save one annotation record"""
    data = request.json
    print(f"DEBUG: Received annotation data: {data}") # Debug info
    
    required_keys = ['video', 'folder', 'imageFile', 'absoluteFrame', 'name']
    if not all(key in data for key in required_keys):
        abort(400, "Missing data for annotation.")

    video_name = data['video']
    annotation_file = get_annotation_file_path(video_name)
    
    try:
        with open(annotation_file, 'r', encoding='utf-8') as f:
            annotations = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        annotations = []
    
    annotation_record = {
        'video': data['video'],
        'folder': data['folder'],
        'image_file': data['imageFile'],
        'absolute_frame': data['absoluteFrame'],
        'name': data['name'],
        'timestamp': pd.Timestamp.now().isoformat()
    }
    
    # Add task index if provided
    if 'taskIndex' in data:
        annotation_record['task_index'] = data['taskIndex']
        
        # Remove any existing annotations for the same task_index
        annotations = [ann for ann in annotations 
                      if ann.get('task_index') != data['taskIndex']]
    
    annotations.append(annotation_record)
    
    try:
        with open(annotation_file, 'w', encoding='utf-8') as f:
            json.dump(annotations, f, indent=4, ensure_ascii=False)
        
        task_info = ""
        if 'taskIndex' in data:
            task_info = f" for task {data['taskIndex'] + 1}"
        
        return jsonify({
            'status': 'success', 
            'message': f'Annotation for frame {data["absoluteFrame"]}{task_info} saved to {annotation_file}.'
        })
    except Exception as e:
        print(f"ERROR: Failed to save annotation. Error: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# --- Main program entry ---
if __name__ == '__main__':
    if not os.path.exists(LABEL_DIR):
        os.makedirs(LABEL_DIR)
        print(f"DEBUG: Created directory '{LABEL_DIR}'. Please place your CSV files here.")
    
    if not os.path.exists(ANNOTATIONS_DIR):
        os.makedirs(ANNOTATIONS_DIR)
        print(f"DEBUG: Created directory '{ANNOTATIONS_DIR}' for annotation files.")

    app.run(debug=True, port=5001)

