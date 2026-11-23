# Tests for POST /ask ("Ask Nudi") in mock mode.

BILL_PAGE = {
    "url": "https://powergrid.example.com/bill",
    "title": "Pay Electricity Bill",
    "text": "Bill amount: ₹1,240. Protection plan added (₹99). Total to pay: ₹1,339. Due: 28 Nov.",
    "elements": [],
}


def ask(client, question, page=BILL_PAGE):
    response = client.post("/ask", json={"question": question, "page": page})
    assert response.status_code == 200
    return response.json()


def test_how_much_gives_the_total(client):
    assert "₹1,339" in ask(client, "How much do I have to pay?")["answer"]


def test_when_gives_the_due_date(client):
    assert "28 Nov" in ask(client, "When is it due?")["answer"]


def test_otp_question_gets_a_warning(client):
    assert "Never share" in ask(client, "Should I tell them my OTP?")["answer"]


def test_safety_question_mentions_the_scam(client):
    page = {**BILL_PAGE, "text": "Your account will be blocked. Update KYC now."}
    assert "Be careful" in ask(client, "Is this page safe?", page)["answer"]


def test_unknown_question_offers_help(client):
    result = ask(client, "What is the weather?")
    assert "How much do I pay?" in result["answer"]
    assert result["mode"] == "mock"


def test_private_numbers_in_the_question_are_not_echoed(client):
    result = ask(client, "My card is 4111 1111 1111 1111, is it safe?")
    assert "4111" not in result["answer"]
