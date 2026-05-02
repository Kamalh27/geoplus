"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import * as echarts from "echarts";
import type { ECharts, EChartsOption } from "echarts";

import type { ChartPaletteId, ChartType, InsightChartDatum } from "@/components/geoplus/insight-chart-config";
import { chartPalettes } from "@/components/geoplus/insight-chart-config";

export type GeoPlusEchartsInsightChartHandle = {
  downloadAsPng: (fileName: string) => void;
};

type GeoPlusEchartsInsightChartProps = {
  data: InsightChartDatum[];
  chartType: ChartType;
  paletteId: ChartPaletteId;
  showValues: boolean;
  title: string;
  isDarkTheme: boolean;
  minWidth?: number;
  className?: string;
};

const clampLabel = (value: string, maxLength: number) => (value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value);

const buildChartOption = (args: {
  data: InsightChartDatum[];
  chartType: ChartType;
  paletteId: ChartPaletteId;
  showValues: boolean;
  title: string;
  isDarkTheme: boolean;
}): EChartsOption => {
  const { data, chartType, paletteId, showValues, title, isDarkTheme } = args;
  const palette = chartPalettes[paletteId].colors;
  const backgroundColor = isDarkTheme ? "#0b1220" : "#ffffff";
  const textColor = isDarkTheme ? "#e2e8f0" : "#0f172a";
  const mutedTextColor = isDarkTheme ? "#94a3b8" : "#475569";
  const axisColor = isDarkTheme ? "#334155" : "#cbd5e1";
  const splitLineColor = isDarkTheme ? "#1e293b" : "#e2e8f0";
  const categories = data.map((item) => item.label);
  const values = data.map((item) => item.value);

  if (data.length === 0) {
    return {
      backgroundColor,
      title: {
        text: title,
        left: 16,
        top: 10,
        textStyle: {
          color: textColor,
          fontSize: 16,
          fontWeight: 700,
        },
      },
      graphic: {
        type: "text",
        left: "center",
        top: "middle",
        style: {
          text: "No chart data available",
          fill: mutedTextColor,
          font: "500 13px sans-serif",
        },
      },
    };
  }

  const baseOption: EChartsOption = {
    backgroundColor,
    color: palette,
    title: {
      text: title,
      left: 16,
      top: 10,
      textStyle: {
        color: textColor,
        fontSize: 16,
        fontWeight: 700,
      },
    },
    animationDuration: 320,
    animationEasing: "cubicOut",
    tooltip: {
      trigger: chartType === "pie" || chartType === "donut" ? "item" : "axis",
      backgroundColor: isDarkTheme ? "#0f172a" : "#ffffff",
      borderColor: axisColor,
      borderWidth: 1,
      textStyle: {
        color: textColor,
      },
      confine: true,
    },
  };

  if (chartType === "bar") {
    return {
      ...baseOption,
      grid: {
        left: 62,
        right: 24,
        top: 62,
        bottom: categories.length > 8 ? 78 : 58,
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLine: {
          lineStyle: {
            color: axisColor,
          },
        },
        axisLabel: {
          color: mutedTextColor,
          interval: 0,
          rotate: categories.length > 8 ? 28 : 0,
          formatter: (value: string) => clampLabel(value, 12),
        },
      },
      yAxis: {
        type: "value",
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: mutedTextColor,
        },
        splitLine: {
          lineStyle: {
            color: splitLineColor,
          },
        },
      },
      series: [
        {
          type: "bar",
          data: values,
          barMaxWidth: 36,
          itemStyle: {
            borderRadius: [6, 6, 0, 0],
          },
          label: {
            show: showValues,
            position: "top",
            color: textColor,
            formatter: "{c}",
          },
        },
      ],
    };
  }

  if (chartType === "horizontal") {
    return {
      ...baseOption,
      grid: {
        left: 152,
        right: 24,
        top: 62,
        bottom: 42,
      },
      xAxis: {
        type: "value",
        axisLine: {
          lineStyle: {
            color: axisColor,
          },
        },
        axisLabel: {
          color: mutedTextColor,
        },
        splitLine: {
          lineStyle: {
            color: splitLineColor,
          },
        },
      },
      yAxis: {
        type: "category",
        data: categories,
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: mutedTextColor,
          formatter: (value: string) => clampLabel(value, 18),
        },
      },
      series: [
        {
          type: "bar",
          data: values,
          barMaxWidth: 26,
          itemStyle: {
            borderRadius: [0, 6, 6, 0],
          },
          label: {
            show: showValues,
            position: "right",
            color: textColor,
            formatter: "{c}",
          },
        },
      ],
    };
  }

  if (chartType === "line") {
    return {
      ...baseOption,
      grid: {
        left: 62,
        right: 24,
        top: 62,
        bottom: categories.length > 8 ? 78 : 58,
      },
      xAxis: {
        type: "category",
        data: categories,
        axisLine: {
          lineStyle: {
            color: axisColor,
          },
        },
        axisLabel: {
          color: mutedTextColor,
          interval: 0,
          rotate: categories.length > 8 ? 28 : 0,
          formatter: (value: string) => clampLabel(value, 12),
        },
      },
      yAxis: {
        type: "value",
        axisLine: {
          show: false,
        },
        axisTick: {
          show: false,
        },
        axisLabel: {
          color: mutedTextColor,
        },
        splitLine: {
          lineStyle: {
            color: splitLineColor,
          },
        },
      },
      series: [
        {
          type: "line",
          smooth: true,
          data: values,
          symbol: "circle",
          symbolSize: 8,
          lineStyle: {
            width: 2.5,
          },
          label: {
            show: showValues,
            position: "top",
            color: textColor,
            formatter: "{c}",
          },
        },
      ],
    };
  }

  const isDonut = chartType === "donut";

  return {
    ...baseOption,
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 18,
      top: 62,
      bottom: 14,
      textStyle: {
        color: mutedTextColor,
      },
      pageIconColor: mutedTextColor,
      pageTextStyle: {
        color: mutedTextColor,
      },
    },
    series: [
      {
        type: "pie",
        radius: isDonut ? ["44%", "68%"] : "68%",
        center: ["35%", "56%"],
        avoidLabelOverlap: true,
        itemStyle: {
          borderColor: backgroundColor,
          borderWidth: 1,
        },
        label: {
          show: showValues,
          color: textColor,
          formatter: showValues ? "{b}: {c}" : "{b}",
        },
        labelLine: {
          show: showValues,
        },
        data: data.map((item) => ({
          name: item.label,
          value: item.value,
        })),
      },
    ],
  };
};

export const GeoPlusEchartsInsightChart = forwardRef<GeoPlusEchartsInsightChartHandle, GeoPlusEchartsInsightChartProps>(
  function GeoPlusEchartsInsightChart({ data, chartType, paletteId, showValues, title, isDarkTheme, minWidth = 860, className }, ref) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const chartRef = useRef<ECharts | null>(null);

    const option = useMemo(
      () =>
        buildChartOption({
          data,
          chartType,
          paletteId,
          showValues,
          title,
          isDarkTheme,
        }),
      [chartType, data, isDarkTheme, paletteId, showValues, title],
    );

    useEffect(() => {
      if (!containerRef.current) {
        return;
      }

      const chart = echarts.init(containerRef.current, undefined, {
        renderer: "canvas",
      });
      chartRef.current = chart;

      return () => {
        chart.dispose();
        chartRef.current = null;
      };
    }, []);

    useEffect(() => {
      if (!chartRef.current) {
        return;
      }
      chartRef.current.setOption(option, true);
    }, [option]);

    useEffect(() => {
      if (!chartRef.current || !containerRef.current || typeof ResizeObserver === "undefined") {
        return;
      }

      const chart = chartRef.current;
      const resizeObserver = new ResizeObserver(() => {
        chart.resize();
      });

      resizeObserver.observe(containerRef.current);
      return () => {
        resizeObserver.disconnect();
      };
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        downloadAsPng: (fileName: string) => {
          if (!chartRef.current) {
            return;
          }

          const dataUrl = chartRef.current.getDataURL({
            type: "png",
            pixelRatio: 2,
            backgroundColor: isDarkTheme ? "#0b1220" : "#ffffff",
          });

          const link = document.createElement("a");
          link.href = dataUrl;
          link.download = fileName;
          document.body.append(link);
          link.click();
          link.remove();
        },
      }),
      [isDarkTheme],
    );

    return (
      <div className={className} style={{ minWidth: `${minWidth}px` }}>
        <div ref={containerRef} className="h-[420px] w-full" />
      </div>
    );
  },
);
