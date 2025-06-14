import os
import re
import logging
from typing import List, Dict, Any, Optional, Set
from pathlib import Path
import frontmatter
from datetime import datetime

logger = logging.getLogger(__name__)


class ObsidianVaultConnector:
    """Connector for reading and indexing Obsidian vaults."""

    # Common Obsidian folder patterns to skip
    SKIPPED_DIRS = {
        ".obsidian",  # Obsidian configuration folder
        ".trash",  # Obsidian trash folder
        ".git",  # Version control
        "node_modules",
        "__pycache__",
        ".DS_Store",
        "Thumbs.db",
    }

    # File extensions to include
    SUPPORTED_EXTENSIONS = {".md", ".markdown"}

    def __init__(self, vault_paths: List[str]):
        """
        Initialize the Obsidian vault connector.

        Args:
            vault_paths: List of paths to Obsidian vaults
        """
        self.vault_paths = []

        # Validate and store vault paths
        for vault_path in vault_paths:
            path = Path(vault_path).expanduser().resolve()
            if not path.exists():
                logger.warning(f"Vault path does not exist: {vault_path}")
                continue
            if not path.is_dir():
                logger.warning(f"Vault path is not a directory: {vault_path}")
                continue
            self.vault_paths.append(path)

        if not self.vault_paths:
            raise ValueError("No valid vault paths provided")

        logger.info(
            f"Initialized Obsidian connector with {len(self.vault_paths)} vaults"
        )

    def get_vault_files(self) -> List[Dict[str, Any]]:
        """
        Get all markdown files from all configured vaults.

        Returns:
            List of dictionaries containing file information
        """
        all_files = []

        for vault_path in self.vault_paths:
            vault_name = vault_path.name
            logger.info(f"Scanning vault: {vault_name} at {vault_path}")

            vault_files = self._scan_vault_directory(vault_path, vault_name)
            all_files.extend(vault_files)

        logger.info(f"Found {len(all_files)} markdown files across all vaults")
        return all_files

    def _scan_vault_directory(
        self, vault_path: Path, vault_name: str, current_path: Path = None
    ) -> List[Dict[str, Any]]:
        """
        Recursively scan a vault directory for markdown files.

        Args:
            vault_path: Root path of the vault
            vault_name: Name of the vault
            current_path: Current directory being scanned (for recursion)

        Returns:
            List of file information dictionaries
        """
        if current_path is None:
            current_path = vault_path

        files = []

        try:
            for item in current_path.iterdir():
                # Skip hidden files and directories
                if item.name.startswith("."):
                    continue

                # Skip configured directories
                if item.name in self.SKIPPED_DIRS:
                    logger.debug(f"Skipping directory: {item}")
                    continue

                if item.is_dir():
                    # Recursively scan subdirectories
                    files.extend(
                        self._scan_vault_directory(vault_path, vault_name, item)
                    )

                elif (
                    item.is_file() and item.suffix.lower() in self.SUPPORTED_EXTENSIONS
                ):
                    # Get relative path from vault root
                    relative_path = item.relative_to(vault_path)

                    try:
                        # Get file stats
                        stat = item.stat()

                        files.append(
                            {
                                "vault_name": vault_name,
                                "vault_path": str(vault_path),
                                "file_path": str(item),
                                "relative_path": str(relative_path),
                                "filename": item.name,
                                "size": stat.st_size,
                                "modified_time": datetime.fromtimestamp(stat.st_mtime),
                                "created_time": datetime.fromtimestamp(stat.st_ctime),
                            }
                        )

                    except (OSError, IOError) as e:
                        logger.warning(f"Could not get stats for file {item}: {e}")
                        continue

        except (OSError, IOError) as e:
            logger.error(f"Error scanning directory {current_path}: {e}")

        return files

    def get_file_content(self, file_path: str) -> Optional[Dict[str, Any]]:
        """
        Read and parse a markdown file from an Obsidian vault.

        Args:
            file_path: Full path to the markdown file

        Returns:
            Dictionary containing parsed content and metadata
        """
        try:
            file_path_obj = Path(file_path)

            # Read the file with frontmatter parsing
            with open(file_path_obj, "r", encoding="utf-8") as f:
                post = frontmatter.load(f)

            # Extract frontmatter metadata
            metadata = dict(post.metadata) if post.metadata else {}

            # Get raw content
            content = post.content

            # Parse Obsidian-specific elements
            parsed_content = self._parse_obsidian_content(content)

            # Extract internal links
            internal_links = self._extract_internal_links(content)

            # Extract tags
            tags = self._extract_tags(content, metadata)

            return {
                "content": content,
                "parsed_content": parsed_content,
                "metadata": metadata,
                "internal_links": internal_links,
                "tags": tags,
                "file_path": str(file_path_obj),
                "filename": file_path_obj.name,
                "title": self._extract_title(content, metadata, file_path_obj.stem),
            }

        except (OSError, IOError) as e:
            logger.error(f"Error reading file {file_path}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error parsing file {file_path}: {e}")
            return None

    def _parse_obsidian_content(self, content: str) -> str:
        """
        Parse Obsidian-specific markdown syntax.

        Args:
            content: Raw markdown content

        Returns:
            Parsed content with Obsidian syntax processed
        """
        # Convert internal links to regular markdown format
        # [[Note Title]] -> [Note Title](Note Title)
        content = re.sub(r"\[\[([^\]]+)\]\]", r"[\1](\1)", content)

        # Convert internal links with display text
        # [[Note Title|Display Text]] -> [Display Text](Note Title)
        content = re.sub(r"\[\[([^\]|]+)\|([^\]]+)\]\]", r"[\2](\1)", content)

        # Convert block references (remove them as they're Obsidian-specific)
        # ^block-id -> (removed)
        content = re.sub(r"\^[\w-]+\s*$", "", content, flags=re.MULTILINE)

        # Convert highlights ==text== -> **text** (bold as fallback)
        content = re.sub(r"==([^=]+)==", r"**\1**", content)

        # Handle embeds ![[Note Title]] (convert to link reference)
        content = re.sub(r"!\[\[([^\]]+)\]\]", r"[Embedded: \1](\1)", content)

        return content

    def _extract_internal_links(self, content: str) -> List[str]:
        """
        Extract all internal links from Obsidian content.

        Args:
            content: Raw markdown content

        Returns:
            List of linked note titles
        """
        links = []

        # Find [[Note Title]] format
        simple_links = re.findall(r"\[\[([^\]|]+)\]\]", content)
        links.extend(simple_links)

        # Find [[Note Title|Display Text]] format
        display_links = re.findall(r"\[\[([^\]|]+)\|[^\]]+\]\]", content)
        links.extend(display_links)

        # Find embedded notes ![[Note Title]]
        embedded_links = re.findall(r"!\[\[([^\]]+)\]\]", content)
        links.extend(embedded_links)

        # Remove duplicates and return
        return list(set(links))

    def _extract_tags(self, content: str, metadata: Dict[str, Any]) -> List[str]:
        """
        Extract tags from both frontmatter and inline content.

        Args:
            content: Raw markdown content
            metadata: Frontmatter metadata

        Returns:
            List of tags
        """
        tags = set()

        # Tags from frontmatter
        if "tags" in metadata:
            if isinstance(metadata["tags"], list):
                tags.update(metadata["tags"])
            elif isinstance(metadata["tags"], str):
                # Handle comma-separated tags
                tags.update([tag.strip() for tag in metadata["tags"].split(",")])

        # Tags from content (#tag format)
        inline_tags = re.findall(r"#(\w+(?:/\w+)*)", content)
        tags.update(inline_tags)

        return sorted(list(tags))

    def _extract_title(
        self, content: str, metadata: Dict[str, Any], filename: str
    ) -> str:
        """
        Extract the title of the note.

        Args:
            content: Raw markdown content
            metadata: Frontmatter metadata
            filename: Filename without extension

        Returns:
            The note title
        """
        # Try frontmatter title first
        if "title" in metadata:
            return str(metadata["title"])

        # Try first H1 heading
        h1_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        if h1_match:
            return h1_match.group(1).strip()

        # Fallback to filename
        return filename.replace("_", " ").replace("-", " ")

    def get_vault_stats(self) -> Dict[str, Any]:
        """
        Get statistics about the configured vaults.

        Returns:
            Dictionary containing vault statistics
        """
        stats = {"total_vaults": len(self.vault_paths), "vaults": []}

        for vault_path in self.vault_paths:
            vault_files = self._scan_vault_directory(vault_path, vault_path.name)

            vault_stats = {
                "name": vault_path.name,
                "path": str(vault_path),
                "total_files": len(vault_files),
                "total_size": sum(f["size"] for f in vault_files),
                "last_modified": max(
                    (f["modified_time"] for f in vault_files), default=None
                ),
            }

            stats["vaults"].append(vault_stats)

        return stats
