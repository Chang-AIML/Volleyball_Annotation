import cv2
import os

# --- Configuration ---


""
# List of video files (ensure paths are correct)
video_list = [
    "./Kent volleyball annotated video and Catapul data 21 03 2025/data/05_02_2025_C2_S1/RAW VIDEO/05_02_2025_C2_S1_VIDEO.mp4",
    "./Kent volleyball annotated video and Catapul data 21 03 2025/data/14_01_2025_C2_S1/RAW VIDEO/14_01_2025_C2_S1_VIDEO.MP4",
    "./Kent volleyball annotated video and Catapul data 21 03 2025/data/16_01_2025_C2_S1/RAW VIDEO/16_01_2025_C2_S1_VIDEO.MP4",
    "./Kent volleyball annotated video and Catapul data 21 03 2025/data/16_01_2025_C2_S2/RAW VIDEO/16_01_2025_C2_S2_VIDEO.mp4",
    "./Kent volleyball annotated video and Catapul data 21 03 2025/data/17_01_2025_C2_S1/RAW VIDEO/17_01_2025_C2_S1_VIDEO.MP4"
]

# Root output directory
output_root = "./static/frames"
# Target sampling frame rate (your app calculates time based on 25fps)
fps_target = 25
# Number of frames per folder
chunk_size = 1000

# --- Main Script Logic ---

def process_video(video_path):
    """
    Processes a single video file, extracting frames and saving them
    into the specified directory structure.
    """
    # Check if the video file exists
    if not os.path.exists(video_path):
        print(f"❌ Error: Video file not found -> {video_path}")
        return

    # Get the video name from the path, e.g., "05_02_2025_C2_S1_VIDEO"
    video_name = os.path.splitext(os.path.basename(video_path))[0]
    print(f"🚀 Starting to process video: {video_name}")

    # Create a separate output directory for the current video
    video_output_dir = os.path.join(output_root, video_name)
    os.makedirs(video_output_dir, exist_ok=True)

    # Open the video file
    cap = cv2.VideoCapture(video_path)

    # Get the original frame rate of the video
    original_fps = cap.get(cv2.CAP_PROP_FPS)
    if original_fps == 0:
        print(f"❌ Error: Could not read video frame rate -> {video_path}")
        cap.release()
        return
        
    # Calculate the sampling interval, e.g., for 50fps -> 25fps, sample every 2nd frame
    sample_every = int(round(original_fps / fps_target)) if original_fps > fps_target else 1
    print(f"   - Original FPS: {original_fps:.2f}, Target FPS: {fps_target}. Sampling every {sample_every} frames.")

    # Initialize counters
    frame_read_count = 0  # Total frames read from the video
    frame_saved_count = 0 # Frames actually saved after sampling

    while cap.isOpened():
        # Read a frame
        ret, frame = cap.read()
        
        # If the video is finished, break the loop
        if not ret:
            break

        # Check if it's a frame to be sampled
        if frame_read_count % sample_every == 0:
            
            # --- Calculate folder and file names ---
            
            # Calculate which group/folder the current frame belongs to
            group_index = frame_saved_count // chunk_size
            
            # Calculate the start and end frame IDs for the folder name
            start_frame_id = group_index * chunk_size
            end_frame_id = start_frame_id + chunk_size - 1
            
            # Create the folder path, e.g., "frames_output/VIDEO_NAME/000000_000999"
            group_dir = os.path.join(video_output_dir, f"{start_frame_id:06d}_{end_frame_id:06d}")
            os.makedirs(group_dir, exist_ok=True)
            
            # Calculate the image's index within the current folder (0-999)
            image_index_in_folder = frame_saved_count % chunk_size
            
            # Create the full output path for the image
            # Image filename starts from 000000.jpg, corresponding to the 0th image in the folder
            image_filename = f"{image_index_in_folder:06d}.jpg"
            output_path = os.path.join(group_dir, image_filename)
            
            # Save the image
            cv2.imwrite(output_path, frame)
            
            # Increment the saved frames counter
            frame_saved_count += 1

        # Increment the read frames counter
        frame_read_count += 1
        
        # Print progress
        if frame_read_count % (sample_every * 100) == 0:
            print(f"\r   - Processed {frame_read_count} frames, Saved {frame_saved_count} frames...", end="")

    # Release the video capture object
    cap.release()
    print(f"\n✅ Finished processing: {video_name}, Extracted {frame_saved_count} frames to '{video_output_dir}'")
    print("-" * 50)


# --- Execution ---
if __name__ == "__main__":
    # Ensure the root output directory exists
    os.makedirs(output_root, exist_ok=True)
    
    # Iterate through and process all videos
    for video_file in video_list:
        process_video(video_file)

    print("🎉🎉🎉 All videos processed successfully! 🎉🎉🎉")

