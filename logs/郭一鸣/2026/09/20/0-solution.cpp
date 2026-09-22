#include<iostream>
#include<algorithm>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n,a,b,c;
        cin>>n;
        cin>>a>>b>>c;
        cout<<n-min(a,min(b,c))<<endl;
    }
    return 0;
}