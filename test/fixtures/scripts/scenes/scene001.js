console.log("Test scene script loaded");

export const sceneData = {
  id: "scene_001",
  title: "Opening Scene",
  characters: ["protagonist", "companion"],
  background: "forest_clearing",
  dialogue: [
    {
      character: "protagonist",
      text: "What a beautiful day for an adventure!"
    },
    {
      character: "companion", 
      text: "Indeed! The forest looks particularly inviting today."
    }
  ]
};

export function startScene() {
  console.log("Starting scene:", sceneData.title);
  return sceneData;
}