/**
 * Thrown when the `pkware-test-files` fixture repository is not next to the node-pkware folder.
 */
export class PkwareTestFilesNotFoundException extends Error {
  constructor() {
    super(
      '"pkware-test-files" not found, download it from https://github.com/arx-tools/pkware-test-files and place it next to your "node-pkware" folder!',
    )

    this.name = 'PkwareTestFilesNotFoundException'
  }
}
