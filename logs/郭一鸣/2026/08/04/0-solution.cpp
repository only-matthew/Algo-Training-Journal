#include<iostream>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int n;
        string a,b;
        cin>>n>>a>>b;
        int numa[2]={0},numb[2]={0};
        for(int i=0;i<n;i++)
        {
            if(a[i]=='1')numa[i%2]++;
            if(b[i]=='1')numb[i%2]++;
        }
        if(numa[1]==numb[1]&&numa[0]==numb[0])cout<<"YES"<<endl;
        else cout<<"NO"<<endl;
    }
    return 0;
}