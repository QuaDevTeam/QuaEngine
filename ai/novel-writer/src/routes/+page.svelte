<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import AppTopbar from '$components/workspace/AppTopbar.svelte'
  import ConfirmDialog from '$components/workspace/ConfirmDialog.svelte'
  import EditProjectDialog from '$components/workspace/EditProjectDialog.svelte'
  import InspectorPane from '$components/workspace/InspectorPane.svelte'
  import MainWorkspace from '$components/workspace/MainWorkspace.svelte'
  import NewProjectDialog from '$components/workspace/NewProjectDialog.svelte'
  import ProjectSidebar from '$components/workspace/ProjectSidebar.svelte'
  import SettingsDialog from '$components/workspace/SettingsDialog.svelte'
  import {
    createWorkspaceController,
    type NovelWriterPageData,
  } from '$lib/client/workspace-controller.svelte'

  export let data: NovelWriterPageData

  const workspace = createWorkspaceController(data)

  $: workspace.syncSelectedArtifactDraft()

  onMount(() => {
    workspace.init()
  })

  onDestroy(() => {
    workspace.destroy()
  })
</script>

<svelte:head>
  <title>Novel Writer</title>
</svelte:head>

<div class="app-shell">
  <AppTopbar onOpenSettings={workspace.openConfigDialog} />

  <div class="workspace">
    <ProjectSidebar
      projects={workspace.projects}
      trashedProjects={workspace.trashedProjects}
      selectedProjectId={workspace.selectedProjectId}
      onCreateProject={workspace.openProjectDialog}
      onSelectProject={workspace.selectProject}
      onEditProject={workspace.openEditProjectDialog}
      onResetProject={workspace.resetProject}
      onDeleteProject={workspace.deleteProject}
      onRestoreProject={workspace.restoreProject}
      onPermanentlyDeleteProject={workspace.permanentlyDeleteProject}
      onEmptyTrash={workspace.emptyTrash}
      deletingProjectId={workspace.deletingProjectId}
      resettingProjectId={workspace.resettingProjectId}
      deletingTrashedProjectId={workspace.deletingTrashedProjectId}
      restoringProjectId={workspace.restoringProjectId}
      emptyingTrash={workspace.emptyingTrash}
    />

    <MainWorkspace
      selectedProject={workspace.selectedProject}
      artifacts={workspace.artifacts}
      selectedArtifact={workspace.selectedArtifact}
      selectedArtifactId={workspace.selectedArtifactId}
      liveContent={workspace.liveContent}
      progress={workspace.progress}
      stageTimeline={workspace.stageTimeline}
      bind:artifactMarkdownEdit={workspace.artifactMarkdownEdit}
      bind:reviewNote={workspace.reviewNote}
      pendingApprovalAction={workspace.pendingApprovalAction}
      running={workspace.running}
      exporting={workspace.exportingProjectId === workspace.selectedProjectId}
      resetting={workspace.resettingProjectId === workspace.selectedProjectId}
      onRunProject={workspace.runProject}
      onExportProject={workspace.exportSelectedProject}
      onResetProject={() => {
        if (workspace.selectedProjectId) {
          return workspace.resetProject(workspace.selectedProjectId)
        }
      }}
      onSelectArtifact={(artifactId) => workspace.selectedArtifactId = artifactId}
      onSubmitApproval={workspace.submitApproval}
    />

    <InspectorPane
      reviewFindings={workspace.reviewFindings}
      selectedArtifact={workspace.selectedArtifact}
      visibleEvents={workspace.visibleEvents}
      plannerMessages={workspace.plannerMessages}
      bind:plannerInput={workspace.plannerInput}
      sendingMessage={workspace.sendingMessage}
      onSendPlannerMessage={workspace.sendPlannerMessage}
    />
  </div>
</div>

<SettingsDialog
  bind:dialog={workspace.configDialog}
  config={workspace.config}
  bind:deepSeekApiKey={workspace.deepSeekApiKey}
  bind:tavilyApiKey={workspace.tavilyApiKey}
  bind:deepSeekBaseUrl={workspace.deepSeekBaseUrl}
  bind:tavilyBaseUrl={workspace.tavilyBaseUrl}
  bind:deepSeekModel={workspace.deepSeekModel}
  bind:defaultReasoningEffort={workspace.defaultReasoningEffort}
  bind:maxRevisionLoops={workspace.maxRevisionLoops}
  savingConfig={workspace.savingConfig}
  onSaveConfig={workspace.saveConfig}
/>

<NewProjectDialog
  bind:dialog={workspace.projectDialog}
  bind:projectTitle={workspace.projectTitle}
  bind:projectBrief={workspace.projectBrief}
  bind:projectMode={workspace.projectMode}
  bind:projectMaxRevisionLoops={workspace.projectMaxRevisionLoops}
  bind:seedWorldbuilding={workspace.seedWorldbuilding}
  bind:seedWorldbuildingModificationInstructions={workspace.seedWorldbuildingModificationInstructions}
  bind:seedCharacters={workspace.seedCharacters}
  bind:seedCharactersModificationInstructions={workspace.seedCharactersModificationInstructions}
  bind:seedOutline={workspace.seedOutline}
  bind:seedOutlineModificationInstructions={workspace.seedOutlineModificationInstructions}
  bind:allowExpertSeedChanges={workspace.allowExpertSeedChanges}
  projectCreateError={workspace.projectCreateError}
  hasProjectDraft={workspace.hasProjectDraft}
  creating={workspace.creating}
  onCreateProject={workspace.createProject}
  onResetDraft={workspace.resetProjectDraft}
/>

<EditProjectDialog
  bind:dialog={workspace.editProjectDialog}
  bind:projectTitle={workspace.editProjectTitle}
  bind:projectBrief={workspace.editProjectBrief}
  bind:projectMode={workspace.editProjectMode}
  bind:projectMaxRevisionLoops={workspace.editProjectMaxRevisionLoops}
  bind:seedWorldbuilding={workspace.editSeedWorldbuilding}
  bind:seedWorldbuildingModificationInstructions={workspace.editSeedWorldbuildingModificationInstructions}
  bind:seedCharacters={workspace.editSeedCharacters}
  bind:seedCharactersModificationInstructions={workspace.editSeedCharactersModificationInstructions}
  bind:seedOutline={workspace.editSeedOutline}
  bind:seedOutlineModificationInstructions={workspace.editSeedOutlineModificationInstructions}
  bind:allowExpertSeedChanges={workspace.editAllowExpertSeedChanges}
  saving={workspace.savingProjectEdit}
  error={workspace.projectEditError}
  lastChangedFields={workspace.projectEditChangedFields}
  revisionStarted={workspace.projectEditRevisionStarted}
  onSaveProject={workspace.saveProjectEdit}
/>

<ConfirmDialog
  bind:open={workspace.confirmDialogOpen}
  title={workspace.confirmTitle}
  description={workspace.confirmDescription}
  confirmLabel={workspace.confirmLabel}
  variant={workspace.confirmVariant}
  busy={workspace.confirmBusy}
  onConfirm={workspace.confirmPendingAction}
/>
