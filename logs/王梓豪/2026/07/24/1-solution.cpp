#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <algorithm>
#include<cmath>
using namespace std;
bool cmp(string a,string b)
{
	int tempa=stoi(a);
	int tempb=stoi(b);
	return tempa/(pow(10,a.size())-1)>tempb/(pow(10,b.size())-1);
}
int main() {
	int n;
	cin>>n;
	vector<string> a(n);
	for(int i=0;i<n;i++)
	{
		cin>>a[i];
	}
	sort(a.begin(),a.end(),cmp);
	for(int i=0;i<n;i++)
	{
		cout<<a[i];
	}
}