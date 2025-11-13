import YAML from "js-yaml";

interface Container {
  name: string;
  image: string;
  [key: string]: any;
}

interface WorkloadData {
  id: string;
  name: string;
  type: string;
  containers: Container[];
  config: Record<string, any>;
}

interface ResourceData {
  id: string;
  name: string;
  type: string;
  namespace?: string;
  spec?: Record<string, any>;
  data?: Record<string, any>;
  [key: string]: any;
}

function generateWorkloadYAML(
  workload: WorkloadData,
  namespace: string
): Record<string, any> {
  const baseMetadata = {
    name: workload.name,
    namespace: namespace,
    labels: workload.config.labels || {},
    annotations: workload.config.annotations || {},
  };

  const podSpec = {
    containers: workload.containers.map((container) => ({
      name: container.name || workload.name,
      image: container.image,
      ...(container.ports && { ports: container.ports }),
      ...(container.env && { env: container.env }),
      ...(container.volumeMounts && { volumeMounts: container.volumeMounts }),
      ...(container.resources && { resources: container.resources }),
      ...(container.livenessProbe && { livenessProbe: container.livenessProbe }),
      ...(container.readinessProbe && {
        readinessProbe: container.readinessProbe,
      }),
      ...(container.securityContext && {
        securityContext: container.securityContext,
      }),
    })),
    ...(workload.config.volumes && { volumes: workload.config.volumes }),
    ...(workload.config.nodeSelector && {
      nodeSelector: workload.config.nodeSelector,
    }),
    ...(workload.config.affinity && { affinity: workload.config.affinity }),
    ...(workload.config.tolerations && {
      tolerations: workload.config.tolerations,
    }),
    ...(workload.config.restartPolicy && {
      restartPolicy: workload.config.restartPolicy,
    }),
    ...(workload.config.dnsPolicy && {
      dnsPolicy: workload.config.dnsPolicy,
    }),
    ...(workload.config.serviceAccountName && {
      serviceAccountName: workload.config.serviceAccountName,
    }),
  };

  const baseYAML: Record<string, any> = {
    apiVersion: "v1",
    kind: workload.type,
    metadata: baseMetadata,
  };

  switch (workload.type) {
    case "Pod":
      return {
        ...baseYAML,
        spec: podSpec,
      };

    case "Deployment":
      return {
        ...baseYAML,
        apiVersion: "apps/v1",
        spec: {
          replicas: workload.config.deploymentSpec?.replicas || 1,
          selector: {
            matchLabels: {
              "app.kubernetes.io/name": workload.name,
            },
          },
          template: {
            metadata: {
              labels: {
                "app.kubernetes.io/name": workload.name,
                ...workload.config.labels,
              },
            },
            spec: podSpec,
          },
          ...(workload.config.deploymentSpec?.strategy && {
            strategy: workload.config.deploymentSpec.strategy,
          }),
        },
      };

    case "StatefulSet":
      return {
        ...baseYAML,
        apiVersion: "apps/v1",
        spec: {
          serviceName: workload.config.statefulSetSpec?.serviceName || workload.name,
          replicas: workload.config.statefulSetSpec?.replicas || 1,
          selector: {
            matchLabels: {
              "app.kubernetes.io/name": workload.name,
            },
          },
          template: {
            metadata: {
              labels: {
                "app.kubernetes.io/name": workload.name,
                ...workload.config.labels,
              },
            },
            spec: podSpec,
          },
        },
      };

    case "DaemonSet":
      return {
        ...baseYAML,
        apiVersion: "apps/v1",
        spec: {
          selector: {
            matchLabels: {
              "app.kubernetes.io/name": workload.name,
            },
          },
          template: {
            metadata: {
              labels: {
                "app.kubernetes.io/name": workload.name,
                ...workload.config.labels,
              },
            },
            spec: podSpec,
          },
        },
      };

    case "Job":
      return {
        ...baseYAML,
        apiVersion: "batch/v1",
        spec: {
          template: {
            metadata: {
              labels: {
                "app.kubernetes.io/name": workload.name,
                ...workload.config.labels,
              },
            },
            spec: podSpec,
          },
          ...(workload.config.jobSpec?.backoffLimit && {
            backoffLimit: workload.config.jobSpec.backoffLimit,
          }),
        },
      };

    case "CronJob":
      return {
        ...baseYAML,
        apiVersion: "batch/v1",
        spec: {
          schedule: workload.config.cronJobSpec?.schedule || "0 0 * * *",
          jobTemplate: {
            spec: {
              template: {
                metadata: {
                  labels: {
                    "app.kubernetes.io/name": workload.name,
                    ...workload.config.labels,
                  },
                },
                spec: podSpec,
              },
            },
          },
        },
      };

    case "ReplicaSet":
      return {
        ...baseYAML,
        apiVersion: "apps/v1",
        spec: {
          replicas: workload.config.replicaSetSpec?.replicas || 1,
          selector: {
            matchLabels: {
              "app.kubernetes.io/name": workload.name,
            },
          },
          template: {
            metadata: {
              labels: {
                "app.kubernetes.io/name": workload.name,
                ...workload.config.labels,
              },
            },
            spec: podSpec,
          },
        },
      };

    default:
      return baseYAML;
  }
}

function generateResourceYAML(
  resource: ResourceData,
  namespace: string
): Record<string, any> {
  const baseMetadata = {
    name: resource.name,
    ...(resource.type !== "StorageClass" &&
      resource.type !== "PersistentVolume" && { namespace }),
    labels: resource.labels || {},
    annotations: resource.annotations || {},
  };

  const baseYAML: Record<string, any> = {
    apiVersion: "v1",
    kind: resource.type,
    metadata: baseMetadata,
  };

  switch (resource.type) {
    case "Service":
      return {
        ...baseYAML,
        spec: {
          type: resource.spec?.type || "ClusterIP",
          selector: resource.spec?.selector || {},
          ports: resource.spec?.ports || [],
        },
      };

    case "ConfigMap":
      return {
        ...baseYAML,
        data: resource.data || {},
      };

    case "Secret":
      return {
        ...baseYAML,
        type: resource.spec?.type || "Opaque",
        data: resource.data || {},
      };

    case "PersistentVolume":
      return {
        ...baseYAML,
        spec: resource.spec || {},
      };

    case "PersistentVolumeClaim":
      return {
        ...baseYAML,
        spec: resource.spec || {},
      };

    case "StorageClass":
      return {
        ...baseYAML,
        apiVersion: "storage.k8s.io/v1",
        provisioner: resource.spec?.provisioner || "standard",
        ...resource.spec,
      };

    case "NetworkPolicy":
      return {
        ...baseYAML,
        apiVersion: "networking.k8s.io/v1",
        spec: resource.spec || {},
      };

    case "HTTPRoute":
      return {
        ...baseYAML,
        apiVersion: "gateway.networking.k8s.io/v1",
        spec: resource.spec || {},
      };

    case "GRPCRoute":
      return {
        ...baseYAML,
        apiVersion: "gateway.networking.k8s.io/v1",
        spec: resource.spec || {},
      };

    case "Gateway":
      return {
        ...baseYAML,
        apiVersion: "gateway.networking.k8s.io/v1",
        spec: resource.spec || {},
      };

    case "LimitRange":
      return {
        ...baseYAML,
        spec: resource.spec || {},
      };

    case "RuntimeClass":
      return {
        ...baseYAML,
        apiVersion: "node.k8s.io/v1",
        handler: resource.spec?.handler || "",
      };

    case "VolumeAttributesClass":
      return {
        ...baseYAML,
        apiVersion: "storage.k8s.io/v1beta1",
        driverName: resource.spec?.driverName || "",
      };

    default:
      return baseYAML;
  }
}

export function generateYAMLManifest(
  workloads: WorkloadData[],
  resources: ResourceData[],
  namespace: string
): string {
  const manifests: Record<string, any>[] = [];

  // Generate workload manifests
  workloads.forEach((workload) => {
    manifests.push(generateWorkloadYAML(workload, namespace));
  });

  // Generate resource manifests
  resources.forEach((resource) => {
    manifests.push(generateResourceYAML(resource, namespace));
  });

  // Convert to YAML string
  return manifests
    .map((manifest) => YAML.dump(manifest, { indent: 2 }))
    .join("---\n");
}
