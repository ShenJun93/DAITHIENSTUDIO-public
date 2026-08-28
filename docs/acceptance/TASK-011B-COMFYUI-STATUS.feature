Feature: ComfyUI Readiness and Provider Status UI (TASK-011B)
  As an operator configuring local providers
  I want to see the real-time reachability and configuration status of ComfyUI
  So that I know whether the local image generation pipeline is ready for use

  Scenario: ComfyUI is completely unconfigured
    Given the environment variable COMFYUI_BASE_URL is not set
    When I view the providers page
    Then I see the ComfyUI status is "Unconfigured"
    And the UI instructs me to set COMFYUI_BASE_URL and COMFYUI_IMAGE_MODEL

  Scenario: ComfyUI is configured but unreachable
    Given the environment variables COMFYUI_BASE_URL and COMFYUI_IMAGE_MODEL are set
    But the ComfyUI server is down or unreachable
    When I view the providers page
    Then I see the ComfyUI status is "Unreachable"
    And I see actionable failure text advising me to start the ComfyUI server

  Scenario: ComfyUI is configured and running normally
    Given the environment variables COMFYUI_BASE_URL and COMFYUI_IMAGE_MODEL are set
    And the ComfyUI server at COMFYUI_BASE_URL is reachable
    When I view the providers page
    Then I see the ComfyUI status is "Ready"
    And I see the selected checkpoint matches COMFYUI_IMAGE_MODEL
    And I see it has image-only capability
