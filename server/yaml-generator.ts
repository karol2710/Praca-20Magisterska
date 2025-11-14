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

function cleanEmptyValues(obj: Record<string, any>): Record<string, any> {
  const cleaned: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === "") {
      continue;
    }

    if (typeof value === "object" && !Array.isArray(value)) {
      const nestedCleaned = cleanEmptyValues(value);
      if (Object.keys(nestedCleaned).length > 0) {
        cleaned[key] = nestedCleaned;
      }
    } else if (Array.isArray(value)) {
      const cleanedArray = value
        .map((item) => (typeof item === "object" && item !== null ? cleanEmptyValues(item) : item))
        .filter((item) => {
          if (typeof item === "object" && !Array.isArray(item)) {
            return Object.keys(item).length > 0;
          }
          return item !== null && item !== undefined && item !== "";
        });
      if (cleanedArray.length > 0) {
        cleaned[key] = cleanedArray;
      }
    } else if (typeof value === "boolean" || typeof value === "number") {
      cleaned[key] = value;
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

function buildContainerSpec(container: Container): Record<string, any> {
  const spec: Record<string, any> = {
    name: container.name,
    image: container.image,
  };

  if (container.imagePullPolicy) spec.imagePullPolicy = container.imagePullPolicy;
  if (container.args && container.args.length > 0) spec.args = container.args;
  if (container.command && container.command.length > 0) spec.command = container.command;
  if (container.stdin !== undefined) spec.stdin = container.stdin;
  if (container.stdinOnce !== undefined) spec.stdinOnce = container.stdinOnce;
  if (container.tty !== undefined) spec.tty = container.tty;

  if (container.lifecycle) {
    const lifecycle: Record<string, any> = {};
    if (container.lifecycle.postStart) lifecycle.postStart = container.lifecycle.postStart;
    if (container.lifecycle.preStop) lifecycle.preStop = container.lifecycle.preStop;
    if (Object.keys(lifecycle).length > 0) spec.lifecycle = lifecycle;
  }

  if (container.terminationMessagePath) spec.terminationMessagePath = container.terminationMessagePath;
  if (container.terminationMessagePolicy) spec.terminationMessagePolicy = container.terminationMessagePolicy;

  if (container.env && container.env.length > 0) spec.env = container.env;
  if (container.envFrom && container.envFrom.length > 0) spec.envFrom = container.envFrom;
  if (container.ports && container.ports.length > 0) spec.ports = container.ports;

  if (container.startupProbe) spec.startupProbe = container.startupProbe;
  if (container.livenessProbe) spec.livenessProbe = container.livenessProbe;
  if (container.readinessProbe) spec.readinessProbe = container.readinessProbe;

  if (container.volumeMounts && container.volumeMounts.length > 0) spec.volumeMounts = container.volumeMounts;
  if (container.volumeDevices && container.volumeDevices.length > 0) spec.volumeDevices = container.volumeDevices;

  if (container.resources) {
    const resources: Record<string, any> = {};
    if (container.resources.limits) resources.limits = container.resources.limits;
    if (container.resources.requests) resources.requests = container.resources.requests;
    if (Object.keys(resources).length > 0) spec.resources = resources;
  }

  if (container.workingDir) spec.workingDir = container.workingDir;
  if (container.resizePolicy && container.resizePolicy.length > 0) spec.resizePolicy = container.resizePolicy;
  if (container.restartPolicy) spec.restartPolicy = container.restartPolicy;
  if (container.restartPolicyRules && container.restartPolicyRules.length > 0) spec.restartPolicyRules = container.restartPolicyRules;
  if (container.securityContext) spec.securityContext = container.securityContext;

  return spec;
}

function buildPodSpec(config: Record<string, any>, containers: Container[]): Record<string, any> {
  const spec: Record<string, any> = {};

  spec.containers = containers.map((container) => buildContainerSpec(container));

  if (config.initContainers && config.initContainers.length > 0) {
    spec.initContainers = config.initContainers.map((container: Container) => buildContainerSpec(container));
  }

  if (config.ephemeralContainers && config.ephemeralContainers.length > 0) {
    spec.ephemeralContainers = config.ephemeralContainers.map((container: Container) => buildContainerSpec(container));
  }

  if (config.podDeathTime) spec.activeDeadlineSeconds = config.podDeathTime;
  if (config.terminationGracePeriodSeconds) spec.terminationGracePeriodSeconds = config.terminationGracePeriodSeconds;
  if (config.restartPolicy) spec.restartPolicy = config.restartPolicy;

  if (config.nodeName) spec.nodeName = config.nodeName;
  if (config.priority !== undefined) spec.priority = config.priority;
  if (config.priorityClassName) spec.priorityClassName = config.priorityClassName;

  if (config.serviceAccountName) spec.serviceAccountName = config.serviceAccountName;
  if (config.automountServiceAccountToken !== undefined) spec.automountServiceAccountToken = config.automountServiceAccountToken;

  if (config.hostname) spec.hostname = config.hostname;
  if (config.subdomain) spec.subdomain = config.subdomain;
  if (config.dnsPolicy) spec.dnsPolicy = config.dnsPolicy;
  if (config.enableServiceLinks !== undefined) spec.enableServiceLinks = config.enableServiceLinks;
  if (config.hostIPC !== undefined) spec.hostIPC = config.hostIPC;
  if (config.hostNetwork !== undefined) spec.hostNetwork = config.hostNetwork;
  if (config.hostPID !== undefined) spec.hostPID = config.hostPID;
  if (config.hostUsers !== undefined) spec.hostUsers = config.hostUsers;
  if (config.shareProcessNamespace !== undefined) spec.shareProcessNamespace = config.shareProcessNamespace;

  if (config.dnsConfig) {
    const dnsConfig: Record<string, any> = {};
    if (config.dnsConfig.nameservers && config.dnsConfig.nameservers.length > 0) dnsConfig.nameservers = config.dnsConfig.nameservers;
    if (config.dnsConfig.searches && config.dnsConfig.searches.length > 0) dnsConfig.searches = config.dnsConfig.searches;
    if (config.dnsConfig.options && config.dnsConfig.options.length > 0) dnsConfig.options = config.dnsConfig.options;
    if (Object.keys(dnsConfig).length > 0) spec.dnsConfig = dnsConfig;
  }

  if (config.hostAliases && config.hostAliases.length > 0) spec.hostAliases = config.hostAliases;

  if (config.tolerations && config.tolerations.length > 0) spec.tolerations = config.tolerations;

  if (config.topologySpreadConstraints && config.topologySpreadConstraints.length > 0) spec.topologySpreadConstraints = config.topologySpreadConstraints;

  if (config.affinity) spec.affinity = config.affinity;

  if (config.imagePullSecrets && typeof config.imagePullSecrets === 'object' && Object.keys(config.imagePullSecrets).length > 0) {
    spec.imagePullSecrets = config.imagePullSecrets;
  }
  if (config.runtimeClassName) spec.runtimeClassName = config.runtimeClassName;

  if (config.volumes && config.volumes.length > 0) spec.volumes = config.volumes;

  if (config.securityContext) spec.securityContext = config.securityContext;

  return spec;
}

export function generatePodYAML(podName: string, podConfig: Record<string, any>, containers: Container[]): Record<string, any> {
  const metadata: Record<string, any> = {
    name: podName,
  };

  if (podConfig.namespace) metadata.namespace = podConfig.namespace;
  if (podConfig.deletionGracePeriodSeconds) metadata.deletionGracePeriodSeconds = podConfig.deletionGracePeriodSeconds;

  if (podConfig.annotations && Object.keys(podConfig.annotations).length > 0) {
    metadata.annotations = podConfig.annotations;
  }

  if (podConfig.labels && Object.keys(podConfig.labels).length > 0) {
    metadata.labels = podConfig.labels;
  }

  if (podConfig.ownerReferences && podConfig.ownerReferences.length > 0) {
    metadata.ownerReferences = podConfig.ownerReferences;
  }

  const yaml: Record<string, any> = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: cleanEmptyValues(metadata),
    spec: cleanEmptyValues(buildPodSpec(podConfig, containers)),
  };

  return cleanEmptyValues(yaml);
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
