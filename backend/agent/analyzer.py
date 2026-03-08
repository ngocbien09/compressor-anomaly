"""
Agentic AI layer using Anthropic Claude API for anomaly explanation and triage.
Supports: structured analysis, streaming tokens, multi-turn chat.
Falls back to mock response when API key is not set.
"""

import os
import json
from datetime import datetime
from typing import Dict, Any, List, Optional, Generator

# Load .env from project root if present
try:
    from pathlib import Path
    _env = Path(__file__).resolve().parents[2] / ".env"
    if _env.exists():
        for _line in _env.read_text().splitlines():
            if "=" in _line and not _line.startswith("#"):
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k.strip(), _v.strip())
except Exception:
    pass

MODEL = "claude-sonnet-4-6"

SYSTEM_PROMPT = """You are an expert rotating equipment engineer specializing in centrifugal compressor diagnostics.
Analyze anomaly detection results from a Multi-Stage Compressor and provide:
1. Root cause hypothesis based on affected sensor patterns
2. Confidence level (High/Medium/Low) with reasoning
3. Recommended actions with urgency level
4. Estimated time to critical failure if no action taken
Be concise, technical, and operational. Always reference specific sensor values.

Respond ONLY with a valid JSON object in this exact format:
{
  "root_cause": "Brief root cause (max 80 chars)",
  "root_cause_detail": "2-3 sentence technical explanation",
  "confidence": "High|Medium|Low",
  "confidence_reasoning": "Why this confidence level",
  "affected_systems": ["list", "of", "affected", "subsystems"],
  "recommended_actions": [
    {"action": "Action description", "urgency": "Immediate|Within 4h|Within 24h|Monitor", "priority": 1}
  ],
  "time_to_critical": "Estimated time string (e.g. '4-8 hours', '2-3 days', 'Unknown')",
  "additional_notes": "Any other relevant observations"
}"""

USER_PROMPT_TEMPLATE = """Analyze this compressor anomaly detection alert:

Timestamp: {anomaly_timestamp}
Severity: {severity}
Ensemble Anomaly Score: {anomaly_score:.3f}
Isolation Forest Score: {if_score:.3f}
LSTM Reconstruction Error: {lstm_reconstruction_error:.4f}
Previous anomalies in last 24h: {previous_anomalies_24h}
Recent trend (60 min): {recent_trend}

Affected Sensors (those deviating >5% from baseline):
{affected_sensors_text}

Provide your engineering diagnosis as a JSON object."""

STREAM_USER_PROMPT_TEMPLATE = """Analyze this compressor anomaly detection alert:

Timestamp: {anomaly_timestamp}
Severity: {severity}
Ensemble Anomaly Score: {anomaly_score:.3f}
Isolation Forest Score: {if_score:.3f}
LSTM Reconstruction Error: {lstm_reconstruction_error:.4f}
Previous anomalies in last 24h: {previous_anomalies_24h}
Recent trend (60 min): {recent_trend}

Affected Sensors (those deviating >5% from baseline):
{affected_sensors_text}

Provide a structured engineering diagnosis using the markdown format specified."""


def _format_affected_sensors(affected_sensors: Dict[str, Dict]) -> str:
    if not affected_sensors:
        return "  No sensors significantly deviated from baseline."
    lines = []
    for sensor, info in affected_sensors.items():
        lines.append(
            f"  - {sensor}: current={info['current']}, baseline={info['baseline']}, "
            f"deviation={info['deviation_pct']:+.1f}%"
        )
    return "\n".join(lines)


def _mock_response(severity: str, affected_sensors: Dict) -> Dict[str, Any]:
    """Fallback response when Claude API is unavailable."""
    sensor_names = list(affected_sensors.keys()) if affected_sensors else []

    if "vibration_x" in sensor_names or "bearing_temperature" in sensor_names:
        root_cause = "Bearing degradation - mechanical wear"
        detail = ("Elevated vibration levels combined with bearing temperature increase suggest "
                  "bearing wear or lubrication failure. This pattern is consistent with early-stage "
                  "bearing degradation requiring prompt inspection.")
        actions = [
            {"action": "Check bearing lubrication level and quality", "urgency": "Within 4h", "priority": 1},
            {"action": "Schedule bearing inspection during next maintenance window", "urgency": "Within 24h", "priority": 2},
            {"action": "Monitor vibration trend every 15 minutes", "urgency": "Monitor", "priority": 3},
        ]
        ttc = "12-24 hours if trend continues"
    elif "flow_rate" in sensor_names and "motor_current" in sensor_names:
        root_cause = "Fouling or blockage in compression path"
        detail = ("Reduced flow rate with increased motor current indicates fouling of internals "
                  "or partial blockage. The compressor is working harder to maintain output, "
                  "which increases wear and energy consumption.")
        actions = [
            {"action": "Check differential pressure across stages", "urgency": "Within 4h", "priority": 1},
            {"action": "Plan cleaning maintenance outage", "urgency": "Within 24h", "priority": 2},
            {"action": "Monitor motor temperature closely", "urgency": "Monitor", "priority": 3},
        ]
        ttc = "2-5 days before performance impact"
    elif "suction_pressure" in sensor_names:
        root_cause = "Possible seal leak or inlet restriction"
        detail = ("Suction pressure anomaly may indicate a seal leak reducing inlet conditions "
                  "or an obstruction in the suction line. Both scenarios reduce overall throughput "
                  "and efficiency.")
        actions = [
            {"action": "Inspect suction line and inlet filter", "urgency": "Within 4h", "priority": 1},
            {"action": "Check seal integrity and condition", "urgency": "Within 24h", "priority": 2},
        ]
        ttc = "6-12 hours if seal leak confirmed"
    else:
        root_cause = "Multi-sensor anomaly - undetermined root cause"
        detail = ("Multiple sensors showing deviation from baseline without a clear single-cause "
                  "pattern. Further investigation required to isolate the root cause.")
        actions = [
            {"action": "Perform manual inspection of all major subsystems", "urgency": "Within 4h", "priority": 1},
            {"action": "Review maintenance log for recent work", "urgency": "Within 4h", "priority": 2},
            {"action": "Increase monitoring frequency to 5-minute intervals", "urgency": "Monitor", "priority": 3},
        ]
        ttc = "Unknown - monitor closely"

    return {
        "root_cause": root_cause,
        "root_cause_detail": detail,
        "confidence": "Medium" if severity in ("MEDIUM", "HIGH") else "Low",
        "confidence_reasoning": "Rule-based analysis — Claude AI available once account has credits",
        "affected_systems": sensor_names[:4] if sensor_names else ["Unknown"],
        "recommended_actions": actions,
        "time_to_critical": ttc,
        "additional_notes": "Rule-based fallback response. Add Anthropic credits to enable Claude AI-powered analysis.",
        "is_mock": True,
    }


STREAM_SYSTEM_PROMPT = """You are CompressorGuard AI — an expert rotating-equipment engineer specializing in centrifugal compressor diagnostics.
When given sensor anomaly data, produce a clear, structured engineering diagnosis.

Format your response with these sections:
## Root Cause
Brief hypothesis (1-2 sentences).

## Evidence
Bullet points linking specific sensor readings to the diagnosis.

## Risk Assessment
Severity + estimated time to critical failure if untreated.

## Recommended Actions
Numbered list with urgency tags [IMMEDIATE] [4H] [24H] [MONITOR].

## Additional Notes
Any other relevant observations.

Be technical, specific, and actionable. Reference actual sensor values in your analysis."""

CHAT_SYSTEM_PROMPT = """You are CompressorGuard AI — an expert rotating-equipment engineer for centrifugal compressors.
You have already analyzed an anomaly for this user. Answer their follow-up questions clearly and technically.
Reference the anomaly context when relevant. Keep answers concise and actionable."""


def stream_analyze_anomaly(anomaly_data: Dict[str, Any]) -> Generator[str, None, None]:
    """
    Stream Claude's analysis as text tokens via a generator.
    Yields: 'data:text:<chunk>', then 'data:done:<json_structured>'
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    severity = anomaly_data.get("severity", "LOW")
    affected_sensors = anomaly_data.get("affected_sensors", {})

    if not api_key:
        mock = _mock_response(severity, affected_sensors)
        text = f"## Root Cause\n{mock['root_cause']}\n\n{mock['root_cause_detail']}\n\n"
        text += "## Recommended Actions\n"
        for a in mock["recommended_actions"]:
            text += f"- [{a['urgency'].upper()}] {a['action']}\n"
        text += f"\n## Time to Critical\n{mock['time_to_critical']}"
        for word in text.split(" "):
            yield f"text:{word} "
        yield f"done:{json.dumps(mock)}"
        return

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        affected_text = _format_affected_sensors(affected_sensors)
        user_msg = STREAM_USER_PROMPT_TEMPLATE.format(
            anomaly_timestamp=anomaly_data.get("anomaly_timestamp", datetime.utcnow().isoformat()),
            severity=severity,
            anomaly_score=anomaly_data.get("anomaly_score", 0.0),
            if_score=anomaly_data.get("if_score", 0.0),
            lstm_reconstruction_error=anomaly_data.get("lstm_reconstruction_error", 0.0),
            previous_anomalies_24h=anomaly_data.get("previous_anomalies_24h", 0),
            recent_trend=anomaly_data.get("recent_trend", "No trend data"),
            affected_sensors_text=affected_text,
        )

        full_text = ""
        with client.messages.stream(
            model=MODEL,
            max_tokens=1200,
            system=STREAM_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        ) as stream:
            for chunk in stream.text_stream:
                full_text += chunk
                yield f"text:{chunk}"

        # After streaming completes, also call structured analysis silently
        structured = analyze_anomaly(anomaly_data)
        structured["stream_text"] = full_text
        yield f"done:{json.dumps(structured)}"

    except Exception as e:
        err = str(e)
        if "credit balance" in err or "insufficient" in err.lower():
            yield "error:Anthropic account needs credits. Add credits at console.anthropic.com → Billing, then retry."
        else:
            yield f"error:{err}"


def stream_chat(messages: List[Dict], anomaly_context: Dict[str, Any]) -> Generator[str, None, None]:
    """
    Stream a chat turn. messages = [{role, content}, ...] full history.
    Yields text chunks then 'done:'.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        yield "text:API key not configured. Please set ANTHROPIC_API_KEY."
        yield "done:{}"
        return

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)

        # Inject anomaly context into the system prompt
        affected = _format_affected_sensors(anomaly_context.get("affected_sensors", {}))
        context_note = (
            f"\n\nCurrent anomaly context:\n"
            f"Severity: {anomaly_context.get('severity','?')} | "
            f"Score: {anomaly_context.get('anomaly_score',0):.2f} | "
            f"Time: {anomaly_context.get('anomaly_timestamp','?')}\n"
            f"Sensors:\n{affected}"
        )

        with client.messages.stream(
            model=MODEL,
            max_tokens=800,
            system=CHAT_SYSTEM_PROMPT + context_note,
            messages=messages,
        ) as stream:
            for chunk in stream.text_stream:
                yield f"text:{chunk}"

        yield "done:{}"

    except Exception as e:
        err = str(e)
        if "credit balance" in err or "insufficient" in err.lower():
            yield "error:Anthropic account needs credits. Add credits at console.anthropic.com → Billing, then retry."
        else:
            yield f"error:{err}"


def analyze_anomaly(anomaly_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Send anomaly data to Claude for expert analysis.
    Returns parsed analysis dict.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    severity = anomaly_data.get("severity", "LOW")
    affected_sensors = anomaly_data.get("affected_sensors", {})

    if not api_key:
        return _mock_response(severity, affected_sensors)

    try:
        import anthropic

        client = anthropic.Anthropic(api_key=api_key)

        affected_text = _format_affected_sensors(affected_sensors)
        user_msg = USER_PROMPT_TEMPLATE.format(
            anomaly_timestamp=anomaly_data.get("anomaly_timestamp", datetime.utcnow().isoformat()),
            severity=severity,
            anomaly_score=anomaly_data.get("anomaly_score", 0.0),
            if_score=anomaly_data.get("if_score", 0.0),
            lstm_reconstruction_error=anomaly_data.get("lstm_reconstruction_error", 0.0),
            previous_anomalies_24h=anomaly_data.get("previous_anomalies_24h", 0),
            recent_trend=anomaly_data.get("recent_trend", "No trend data available"),
            affected_sensors_text=affected_text,
        )

        message = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_msg}],
        )

        raw_text = message.content[0].text.strip()

        # Extract JSON from response
        if "```json" in raw_text:
            raw_text = raw_text.split("```json")[1].split("```")[0].strip()
        elif "```" in raw_text:
            raw_text = raw_text.split("```")[1].split("```")[0].strip()

        parsed = json.loads(raw_text)
        parsed["is_mock"] = False
        parsed["raw_response"] = message.content[0].text
        return parsed

    except json.JSONDecodeError:
        # Return raw text if JSON parsing fails
        return {
            **_mock_response(severity, affected_sensors),
            "raw_response": raw_text if "raw_text" in dir() else "Parse error",
            "parse_error": True,
        }
    except Exception as e:
        return {
            **_mock_response(severity, affected_sensors),
            "api_error": str(e),
        }
