import { ContainerConfig } from "@/components/ContainerConfiguration";

interface WorkloadContainer extends ContainerConfig {
  id: string;
}

interface Workload {
  id: string;
  name: string;
  type: string;
  containers?: WorkloadContainer[];
}

interface GlobalConfig {
  namespace: string;
  domain: string;
  requestsPerSecond?: string;
  resourceQuota?: Record<string, any>;
}

interface TemplateGenerationResult {
  clusterIpServices: string[];
  httpRoute: string | null;
  workloadPortMappings: Record<string, number[]>;
}

interface GenerateTemplatesOptions {
  userCreatedClusterIPNames?: string[];
}

export function generateTemplates(
  workloads: Workload[],
  globalConfig: GlobalConfig,
  createClusterIP: boolean,
  createHTTPRoute: boolean,
  options?: GenerateTemplatesOptions
): TemplateGenerationResult {
  const result: TemplateGenerationResult = {
    clusterIpServices: [],
    httpRoute: null,
    workloadPortMappings: {},
  };

  if (!createClusterIP && !createHTTPRoute) {
    return result;
  }

  // Extract container ports from all workloads
  const workloadPortMappings: Record<string, number[]> = {};
  workloads.forEach((workload) => {
    const ports: number[] = [];
    if (workload.containers) {
      workload.containers.forEach((container) => {
        if (container.ports && container.ports.length > 0) {
          container.ports.forEach((port) => {
            if (port.containerPort && !ports.includes(port.containerPort)) {
              ports.push(port.containerPort);
            }
          });
        }
      });
    }
    workloadPortMappings[workload.name] = ports;
  });

  result.workloadPortMappings = workloadPortMappings;

  // Generate ClusterIP services
  if (createClusterIP) {
    workloads.forEach((workload) => {
      const ports = workloadPortMappings[workload.name];
      if (ports.length > 0) {
        const clusterIpYaml = generateClusterIPService(
          workload.name,
          globalConfig.namespace,
          ports
        );
        result.clusterIpServices.push(clusterIpYaml);
      }
    });
  }

  // Generate single HTTPRoute with all workloads/ClusterIPs as backend refs
  if (createHTTPRoute) {
    const workloadsWithPorts = workloads.filter(
      (w) => workloadPortMappings[w.name]?.length > 0
    );

    if (workloadsWithPorts.length > 0) {
      result.httpRoute = generateHTTPRoute(
        workloadsWithPorts,
        globalConfig.namespace,
        globalConfig.domain,
        options?.userCreatedClusterIPNames
      );
    }
  }

  return result;
}

function generateClusterIPService(
  workloadName: string,
  namespace: string,
  ports: number[]
): string {
  const serviceName = `${workloadName.toLowerCase()}-clusterip`;
  const appLabel = workloadName.toLowerCase();

  const portSpecs = ports
    .map(
      (port) => `    - port: ${port}
      targetPort: ${port}`
    )
    .join("\n");

  return `apiVersion: v1
kind: Service
metadata:
  name: ${serviceName}
  namespace: ${namespace}
spec:
  selector:
    app: ${appLabel}
  ports:
${portSpecs}
  type: ClusterIP`;
}

function generateHTTPRoute(
  workloads: Workload[],
  namespace: string,
  domain: string
): string {
  const routeName = `${namespace}-route`;

  const backendRefs = workloads
    .map((w) => {
      const serviceName = `${w.name.toLowerCase()}-clusterip`;
      return `        - name: ${serviceName}\n          port: 80`;
    })
    .join("\n");

  return `apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: ${routeName}
  namespace: ${namespace}
spec:
  parentRefs:
    - name: platform-gateway
      namespace: envoy-gateway-system
  hostnames:
    - ${domain}
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
${backendRefs}`;
}

export function combineYamlDocuments(
  clusterIpServices: string[],
  httpRoute: string | null
): string {
  const documents: string[] = [];

  clusterIpServices.forEach((service) => {
    documents.push(service);
  });

  if (httpRoute) {
    documents.push(httpRoute);
  }

  return documents.join("\n---\n");
}
