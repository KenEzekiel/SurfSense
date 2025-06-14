"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Info,
  Loader2,
  Plus,
  X,
  FolderOpen,
  FileText,
} from "lucide-react";

import { useSearchSourceConnectors } from "@/hooks/useSearchSourceConnectors";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

// Define the form schema with Zod
const obsidianVaultConnectorFormSchema = z.object({
  name: z.string().min(3, {
    message: "Connector name must be at least 3 characters.",
  }),
  vault_paths: z.array(z.string().min(1, "Vault path cannot be empty")).min(1, {
    message: "At least one vault path is required.",
  }),
});

// Define the type for the form values
type ObsidianVaultConnectorFormValues = z.infer<
  typeof obsidianVaultConnectorFormSchema
>;

interface VaultPreview {
  vault_stats: {
    total_vaults: number;
    vaults: Array<{
      name: string;
      path: string;
      total_files: number;
      total_size: number;
      last_modified: string | null;
    }>;
  };
  total_files: number;
  files: Array<{
    vault_name: string;
    vault_path: string;
    file_path: string;
    relative_path: string;
    filename: string;
    size: number;
    modified_time: string;
    created_time: string;
  }>;
  truncated: boolean;
}

export default function ObsidianVaultConnectorPage() {
  const router = useRouter();
  const params = useParams();
  const searchSpaceId = params.search_space_id as string;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [vaultPreview, setVaultPreview] = useState<VaultPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const { createConnector } = useSearchSourceConnectors();

  // Initialize the form
  const form = useForm<ObsidianVaultConnectorFormValues>({
    resolver: zodResolver(obsidianVaultConnectorFormSchema),
    defaultValues: {
      name: "Obsidian Vault Connector",
      vault_paths: [""],
    },
  });

  const watchedVaultPaths = form.watch("vault_paths");

  // Handle adding a new vault path
  const addVaultPath = () => {
    const currentPaths = form.getValues("vault_paths");
    form.setValue("vault_paths", [...currentPaths, ""]);
  };

  // Handle removing a vault path
  const removeVaultPath = (index: number) => {
    const currentPaths = form.getValues("vault_paths");
    if (currentPaths.length > 1) {
      const newPaths = currentPaths.filter((_, i) => i !== index);
      form.setValue("vault_paths", newPaths);
    }
  };

  // Handle vault path change
  const updateVaultPath = (index: number, value: string) => {
    const currentPaths = form.getValues("vault_paths");
    const newPaths = [...currentPaths];
    newPaths[index] = value;
    form.setValue("vault_paths", newPaths);
  };

  // Preview vault contents
  const previewVaults = async () => {
    const vaultPaths = watchedVaultPaths.filter((path) => path.trim() !== "");

    if (vaultPaths.length === 0) {
      toast.error("Please add at least one vault path to preview");
      return;
    }

    setIsPreviewLoading(true);
    setPreviewError(null);

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_FASTAPI_BACKEND_URL}/api/v1/obsidian/vault-files/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${localStorage.getItem(
              "surfsense_bearer_token"
            )}`,
          },
          body: JSON.stringify({ vault_paths: vaultPaths }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to preview vault contents");
      }

      const data = await response.json();
      setVaultPreview(data);
      toast.success("Vault preview loaded successfully!");
    } catch (error) {
      console.error("Error previewing vault:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to preview vault contents";
      setPreviewError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Handle form submission
  const onSubmit = async (values: ObsidianVaultConnectorFormValues) => {
    const validPaths = values.vault_paths.filter((path) => path.trim() !== "");

    if (validPaths.length === 0) {
      toast.error("Please add at least one valid vault path");
      return;
    }

    setIsSubmitting(true);
    try {
      await createConnector({
        name: values.name,
        connector_type: "OBSIDIAN_CONNECTOR",
        config: {
          vault_paths: validPaths,
        },
        is_indexable: true,
        last_indexed_at: null,
      });

      toast.success("Obsidian Vault connector created successfully!");

      // Navigate back to connectors page
      router.push(`/dashboard/${searchSpaceId}/connectors`);
    } catch (error) {
      console.error("Error creating connector:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create connector"
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <div className="container mx-auto py-8 max-w-4xl">
      <Button
        variant="ghost"
        className="mb-6"
        onClick={() =>
          router.push(`/dashboard/${searchSpaceId}/connectors/add`)
        }
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Connectors
      </Button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Tabs defaultValue="connect" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-6">
            <TabsTrigger value="connect">Connect</TabsTrigger>
            <TabsTrigger value="documentation">Documentation</TabsTrigger>
          </TabsList>

          <TabsContent value="connect">
            <Card className="border-2 border-border">
              <CardHeader>
                <CardTitle className="text-2xl font-bold">
                  Connect Obsidian Vaults
                </CardTitle>
                <CardDescription>
                  Integrate with your local Obsidian vaults to index markdown
                  notes, link structures, and knowledge bases. This connector
                  will scan your vault directories and index all markdown files.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Alert className="mb-6 bg-muted">
                  <Info className="h-4 w-4" />
                  <AlertTitle>Local Vault Paths Required</AlertTitle>
                  <AlertDescription>
                    You'll need to provide the full path(s) to your Obsidian
                    vault directories. The connector will scan these directories
                    for .md files and index them for search.
                  </AlertDescription>
                </Alert>

                <Form {...form}>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="space-y-6"
                  >
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Connector Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="My Obsidian Vault Connector"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            A friendly name to identify this connector.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="vault_paths"
                      render={() => (
                        <FormItem>
                          <FormLabel>Vault Paths</FormLabel>
                          <FormDescription>
                            Full paths to your Obsidian vault directories (e.g.,
                            /Users/username/Documents/MyVault)
                          </FormDescription>

                          <div className="space-y-3">
                            {watchedVaultPaths.map((path, index) => (
                              <div key={index} className="flex gap-2">
                                <Input
                                  placeholder={`/path/to/vault${
                                    index > 0 ? `-${index + 1}` : ""
                                  }`}
                                  value={path}
                                  onChange={(e) =>
                                    updateVaultPath(index, e.target.value)
                                  }
                                />
                                {watchedVaultPaths.length > 1 && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() => removeVaultPath(index)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>

                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addVaultPath}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add Another Vault
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={previewVaults}
                              disabled={isPreviewLoading}
                            >
                              {isPreviewLoading ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Loading...
                                </>
                              ) : (
                                <>
                                  <FolderOpen className="mr-2 h-4 w-4" />
                                  Preview Vaults
                                </>
                              )}
                            </Button>
                          </div>

                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Vault Preview Section */}
                    {vaultPreview && (
                      <div className="mt-6 space-y-4">
                        <h3 className="text-lg font-semibold">Vault Preview</h3>

                        {/* Vault Statistics */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {vaultPreview.vault_stats.vaults.map(
                            (vault, index) => (
                              <Card key={index} className="p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <FolderOpen className="h-4 w-4" />
                                  <h4 className="font-medium truncate">
                                    {vault.name}
                                  </h4>
                                </div>
                                <div className="space-y-1 text-sm text-muted-foreground">
                                  <div className="flex justify-between">
                                    <span>Files:</span>
                                    <span>{vault.total_files}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Size:</span>
                                    <span>
                                      {formatFileSize(vault.total_size)}
                                    </span>
                                  </div>
                                  {vault.last_modified && (
                                    <div className="flex justify-between">
                                      <span>Last Modified:</span>
                                      <span>
                                        {new Date(
                                          vault.last_modified
                                        ).toLocaleDateString()}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </Card>
                            )
                          )}
                        </div>

                        {/* File List Preview */}
                        {vaultPreview.files.length > 0 && (
                          <div>
                            <h4 className="font-medium mb-2">
                              Files Preview ({vaultPreview.total_files} total
                              {vaultPreview.truncated
                                ? ", showing first 1000"
                                : ""}
                              )
                            </h4>
                            <div className="max-h-64 overflow-y-auto border rounded-md">
                              <div className="space-y-1 p-2">
                                {vaultPreview.files.map((file, index) => (
                                  <div
                                    key={index}
                                    className="flex items-center gap-2 text-sm py-1"
                                  >
                                    <FileText className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                                    <span className="flex-1 truncate">
                                      <span className="text-muted-foreground">
                                        {file.vault_name}/
                                      </span>
                                      {file.relative_path}
                                    </span>
                                    <Badge
                                      variant="outline"
                                      className="text-xs"
                                    >
                                      {formatFileSize(file.size)}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Preview Error */}
                    {previewError && (
                      <Alert variant="destructive">
                        <AlertTitle>Preview Error</AlertTitle>
                        <AlertDescription>{previewError}</AlertDescription>
                      </Alert>
                    )}

                    <div className="flex justify-end">
                      <Button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full sm:w-auto"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Connecting...
                          </>
                        ) : (
                          <>
                            <Check className="mr-2 h-4 w-4" />
                            Connect Obsidian Vault
                          </>
                        )}
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
              <CardFooter className="flex flex-col items-start border-t bg-muted/50 px-6 py-4">
                <h4 className="text-sm font-medium">
                  What you get with Obsidian Vault integration:
                </h4>
                <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                  <li>Index all markdown files in your Obsidian vaults</li>
                  <li>
                    Preserve Obsidian-specific features like [[internal links]]
                    and #tags
                  </li>
                  <li>Search through your personal knowledge base and notes</li>
                  <li>Support for multiple vault directories</li>
                  <li>Automatic parsing of frontmatter metadata</li>
                  <li>
                    Integration with Obsidian's link structure and note
                    relationships
                  </li>
                </ul>
              </CardFooter>
            </Card>
          </TabsContent>

          <TabsContent value="documentation">
            <Card className="border-2 border-border">
              <CardHeader>
                <CardTitle className="text-2xl font-bold">
                  Obsidian Vault Connector Documentation
                </CardTitle>
                <CardDescription>
                  Learn how to set up and use the Obsidian Vault connector to
                  index your local knowledge base.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <h3 className="text-xl font-semibold mb-2">How it works</h3>
                  <p className="text-muted-foreground">
                    The Obsidian Vault connector scans your local Obsidian vault
                    directories and indexes all markdown files it finds.
                  </p>
                  <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                    <li>
                      The connector preserves Obsidian-specific syntax like{" "}
                      <code>[[internal links]]</code>, <code>#tags</code>, and
                      frontmatter
                    </li>
                    <li>
                      It can handle multiple vault directories in a single
                      connector
                    </li>
                    <li>
                      Only files modified since the last indexing run are
                      processed on subsequent runs
                    </li>
                    <li>
                      Files in <code>.obsidian</code>, <code>.trash</code>, and
                      other system directories are automatically skipped
                    </li>
                  </ul>
                </div>

                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="setup">
                    <AccordionTrigger className="text-lg font-medium">
                      Setup Instructions
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="space-y-6">
                        <div>
                          <h4 className="font-medium mb-2">
                            Step 1: Locate your Obsidian vaults
                          </h4>
                          <p className="text-muted-foreground mb-3">
                            Find the full path to your Obsidian vault
                            directories. Common locations include:
                          </p>
                          <ul className="list-disc pl-5 space-y-1 text-sm">
                            <li>
                              <strong>macOS:</strong>{" "}
                              <code>
                                /Users/[username]/Documents/[VaultName]
                              </code>
                            </li>
                            <li>
                              <strong>Windows:</strong>{" "}
                              <code>
                                C:\Users\[username]\Documents\[VaultName]
                              </code>
                            </li>
                            <li>
                              <strong>Linux:</strong>{" "}
                              <code>
                                /home/[username]/Documents/[VaultName]
                              </code>
                            </li>
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">
                            Step 2: Configure the connector
                          </h4>
                          <ol className="list-decimal pl-5 space-y-3">
                            <li>Enter a descriptive name for your connector</li>
                            <li>
                              Add the full path to each vault you want to index
                            </li>
                            <li>
                              Use the "Preview Vaults" button to verify the
                              paths are correct
                            </li>
                            <li>
                              Review the file count and structure in the preview
                            </li>
                            <li>
                              Click "Connect Obsidian Vault" to create the
                              connector
                            </li>
                          </ol>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">
                            Step 3: Index your vaults
                          </h4>
                          <p className="text-muted-foreground mb-3">
                            After creating the connector, navigate to the
                            Connectors management page to start indexing your
                            vault content.
                          </p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="features">
                    <AccordionTrigger className="text-lg font-medium">
                      Supported Features
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium mb-2">
                            Obsidian Syntax Support
                          </h4>
                          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                            <li>
                              <strong>Internal Links:</strong>{" "}
                              <code>[[Note Title]]</code> and{" "}
                              <code>[[Note Title|Display Text]]</code>
                            </li>
                            <li>
                              <strong>Tags:</strong> <code>#tag</code> and{" "}
                              <code>#nested/tag</code> structures
                            </li>
                            <li>
                              <strong>Frontmatter:</strong> YAML metadata at the
                              beginning of files
                            </li>
                            <li>
                              <strong>Highlights:</strong>{" "}
                              <code>==highlighted text==</code>
                            </li>
                            <li>
                              <strong>Embeds:</strong>{" "}
                              <code>![[Note Title]]</code> for embedded content
                            </li>
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">File Processing</h4>
                          <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                            <li>
                              Supports <code>.md</code> and{" "}
                              <code>.markdown</code> files
                            </li>
                            <li>
                              Automatic detection of file titles from
                              frontmatter, H1 headings, or filenames
                            </li>
                            <li>
                              Preservation of folder structure and relative
                              paths
                            </li>
                            <li>
                              Filtering by file modification dates for
                              incremental updates
                            </li>
                          </ul>
                        </div>

                        <div>
                          <h4 className="font-medium mb-2">
                            Multiple Vault Support
                          </h4>
                          <p className="text-muted-foreground">
                            You can connect multiple Obsidian vaults in a single
                            connector, making it easy to search across all your
                            knowledge bases simultaneously.
                          </p>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="troubleshooting">
                    <AccordionTrigger className="text-lg font-medium">
                      Troubleshooting
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4">
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium mb-2">Common Issues</h4>
                          <ul className="list-disc pl-5 space-y-2 text-sm text-muted-foreground">
                            <li>
                              <strong>Path not found:</strong> Ensure the vault
                              path is the full absolute path to your vault
                              directory
                            </li>
                            <li>
                              <strong>No files found:</strong> Check that your
                              vault contains .md or .markdown files
                            </li>
                            <li>
                              <strong>Permission errors:</strong> Ensure the
                              application has read access to your vault
                              directory
                            </li>
                            <li>
                              <strong>Slow indexing:</strong> Large vaults with
                              many files may take longer to process initially
                            </li>
                          </ul>
                        </div>

                        <Alert className="bg-muted">
                          <Info className="h-4 w-4" />
                          <AlertTitle>Performance Tips</AlertTitle>
                          <AlertDescription>
                            For large vaults (1000+ files), consider using the
                            date filtering options during indexing to process
                            files incrementally and improve performance.
                          </AlertDescription>
                        </Alert>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
