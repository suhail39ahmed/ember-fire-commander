from sms_config import DEFAULT_TEMPLATE, sms_config


def test_contacts_are_last_known_other_people_not_the_volunteers_own_phone():
    own = '+6281299991111'
    lead = {"name": " Crew lead ", "phone": "+6281234567890", "role": "crew_lead"}
    duty = {"name": "Duty desk", "phone": "+627631234567", "role": "duty_line"}
    config = sms_config({"phone": own, "sms": {"recipients": [lead, lead, duty, {**lead, "phone": own}, {**lead, "phone": "not-a-number"}, {**lead, "role": "volunteer"}]}})
    assert [row['phone'] for row in config['recipients']] == [lead['phone'], duty['phone']]
    assert config['recipients'][0]['name'] == 'Crew lead'
    assert config['templates']['help'] == DEFAULT_TEMPLATE


def test_missing_or_malformed_config_does_not_invent_recipients():
    assert sms_config({'phone': '+6281299991111'}) is None
    assert sms_config({'sms': {'recipients': 'invalid'}})['recipients'] == []


def test_templates_cannot_drop_location_or_substitute_unknown_fields():
    config = sms_config({'sms': {'templates': {'help': '{status} {phone}', 'safe': '{status}', 'spreading': 'EMBER {status}: {name}, {incidentCode}, {time}, {location}'}}})
    assert config['templates']['help'] == DEFAULT_TEMPLATE
    assert config['templates']['safe'] == DEFAULT_TEMPLATE
    assert config['templates']['spreading'] == 'EMBER {status}: {name}, {incidentCode}, {time}, {location}'


def test_me_exposes_sms_contacts_but_clients_cannot_edit_them():
    from app import app
    import identity
    import volunteer_routes
    from unittest.mock import patch
    profile = {'phone': '+6281299991111', 'sms': {'recipients': [{'name': 'Lead', 'phone': '+6281234567890', 'role': 'crew_lead'}]}}
    with patch.object(identity, 'verify_id_token', return_value={'uid': 'sari', 'name': 'Sari', 'role': 'volunteer'}), patch.object(identity, 'check_not_revoked'), patch.object(volunteer_routes, 'read_profile', return_value=profile), patch.object(volunteer_routes, 'read_demo_mode', return_value=False):
        client = app.test_client()
        headers = {'Authorization': 'Bearer valid'}
        response = client.get('/me', headers=headers)
        assert response.status_code == 200
        assert response.json['sms']['recipients'][0]['phone'] == '+6281234567890'
        assert response.json['phoneMasked'] == '•••• 1111'
        assert client.patch('/me', headers=headers, json={'sms': profile['sms']}).status_code == 400
